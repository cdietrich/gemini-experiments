import 'dotenv/config';
import { GoogleGenAI, Type, FunctionDeclaration, Content, Part } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY not set. Create a .env file with your API key.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const MODEL = 'gemini-3-flash-preview';

async function basicGeneration() {
  console.log('\n=== Basic Generation ===');
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: 'Explain quantum computing in one sentence.',
  });
  console.log(response.text ?? 'No response');
}

async function streamingGeneration() {
  console.log('\n=== Streaming Generation ===');
  const stream = await ai.models.generateContentStream({
    model: MODEL,
    contents: 'Write a haiku about programming.',
  });
  for await (const chunk of stream) {
    process.stdout.write(chunk.text ?? '');
  }
  console.log('\n');
}

async function toolCallSingle() {
  console.log('\n=== Single Tool Call ===');

  const getWeatherDeclaration: FunctionDeclaration = {
    name: 'get_weather',
    description: 'Gets the current weather for a given location.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        location: {
          type: Type.STRING,
          description: 'The city and country, e.g., "Paris, France"',
        },
      },
      required: ['location'],
    },
  };

  function getWeather(location: string): string {
    const mockData: Record<string, string> = {
      'paris': 'Sunny, 22°C',
      'london': 'Rainy, 15°C',
      'tokyo': 'Cloudy, 18°C',
      'new york': 'Partly cloudy, 20°C',
    };
    const key = location.toLowerCase().split(',')[0].trim();
    return mockData[key] || `Weather data unavailable for ${location}`;
  }

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: 'What is the weather like in Paris right now?',
    config: {
      tools: [{ functionDeclarations: [getWeatherDeclaration] }],
    },
  });

  const funcCall = response.functionCalls?.[0];
  const modelContent = response.candidates?.[0]?.content;

  if (funcCall && funcCall.args && modelContent) {
    console.log(`Model wants to call: ${funcCall.name}`);
    console.log(`Arguments:`, funcCall.args);
    const result = getWeather(funcCall.args.location as string);
    console.log(`Function result: ${result}`);

    const finalResponse = await ai.models.generateContent({
      model: MODEL,
      contents: [
        { role: 'user', parts: [{ text: 'What is the weather like in Paris right now?' }] },
        modelContent,
        { role: 'user', parts: [{ functionResponse: { name: funcCall.name ?? 'get_weather', response: { result } } }] },
      ],
      config: {
        tools: [{ functionDeclarations: [getWeatherDeclaration] }],
      },
    });
    console.log(`Final answer: ${finalResponse.text ?? 'No response'}`);
  }
}

async function toolCallRepeated() {
  console.log('\n=== Repeated Tool Calls (Agentic Loop) ===');

  const tools: FunctionDeclaration[] = [
    {
      name: 'get_weather',
      description: 'Gets the current weather for a location.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          location: { type: Type.STRING, description: 'City name' },
        },
        required: ['location'],
      },
    },
    {
      name: 'get_temperature',
      description: 'Converts temperature between Celsius and Fahrenheit.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          celsius: { type: Type.NUMBER, description: 'Temperature in Celsius' },
        },
        required: ['celsius'],
      },
    },
    {
      name: 'get_time',
      description: 'Gets the current time in a timezone.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          timezone: { type: Type.STRING, description: 'IANA timezone, e.g., Europe/Paris' },
        },
        required: ['timezone'],
      },
    },
  ];

  function executeFunction(name: string, args: Record<string, unknown>): string {
    switch (name) {
      case 'get_weather': {
        const weathers: Record<string, string> = {
          'paris': 'Sunny, 22°C',
          'london': 'Rainy, 15°C',
          'tokyo': 'Cloudy, 18°C',
        };
        const loc = String(args.location).toLowerCase();
        return weathers[loc] ?? `No weather data for ${args.location}`;
      }
      case 'get_temperature': {
        const c = Number(args.celsius);
        const f = (c * 9/5) + 32;
        return `${c}°C = ${f.toFixed(1)}°F`;
      }
      case 'get_time': {
        const tz = String(args.timezone);
        const time = new Date().toLocaleTimeString('en-US', { timeZone: tz });
        return `Current time in ${tz}: ${time}`;
      }
      default:
        return `Unknown function: ${name}`;
    }
  }

  const userQuery = 'What is the weather in Paris and what time is it there? Also convert 22 Celsius to Fahrenheit.';

  const contents: Content[] = [
    { role: 'user', parts: [{ text: userQuery }] },
  ];

  let iteration = 0;
  const maxIterations = 10;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`\n--- Iteration ${iteration} ---`);

    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        tools: [{ functionDeclarations: tools }],
      },
    });

    const funcCalls = response.functionCalls;
    const modelContent = response.candidates?.[0]?.content;

    if (!funcCalls || funcCalls.length === 0) {
      console.log(`Final response: ${response.text ?? 'No response'}`);
      break;
    }

    if (modelContent) {
      contents.push(modelContent);
    }

    for (const fc of funcCalls) {
      const args = fc.args ?? {};
      const fnName = fc.name ?? 'unknown';
      console.log(`Calling: ${fnName}(${JSON.stringify(args)})`);
      const result = executeFunction(fnName, args as Record<string, unknown>);
      console.log(`Result: ${result}`);

      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: fnName, response: { result } } }],
      });
    }
  }
}

async function chatWithTools() {
  console.log('\n=== Chat with Tools ===');

  const calculatorTool: FunctionDeclaration = {
    name: 'calculate',
    description: 'Performs basic math operations.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        operation: {
          type: Type.STRING,
          enum: ['add', 'subtract', 'multiply', 'divide'],
          description: 'The math operation to perform',
        },
        a: { type: Type.NUMBER, description: 'First operand' },
        b: { type: Type.NUMBER, description: 'Second operand' },
      },
      required: ['operation', 'a', 'b'],
    },
  };

  function calculate(op: string, a: number, b: number): number {
    switch (op) {
      case 'add': return a + b;
      case 'subtract': return a - b;
      case 'multiply': return a * b;
      case 'divide': return b !== 0 ? a / b : NaN;
      default: return NaN;
    }
  }

  const chat = ai.chats.create({
    model: MODEL,
    config: {
      tools: [{ functionDeclarations: [calculatorTool] }],
    },
  });

  const questions = [
    'What is 25 multiplied by 4?',
    'Now add 10 to that result.',
    'Divide the previous answer by 2.',
  ];

  for (const q of questions) {
    console.log(`\nUser: ${q}`);
    const response = await chat.sendMessage({ message: q });

    if (response.functionCalls?.length) {
      for (const fc of response.functionCalls) {
        const args = fc.args ?? {};
        const result = calculate(
          String(args.operation),
          Number(args.a),
          Number(args.b)
        );
        console.log(`Tool call: ${fc.name}(${JSON.stringify(args)}) = ${result}`);
        const final = await chat.sendMessage({
          message: [{ functionResponse: { name: fc.name ?? 'calculate', response: { result } } }],
        });
        console.log(`Assistant: ${final.text ?? 'No response'}`);
      }
    } else {
      console.log(`Assistant: ${response.text ?? 'No response'}`);
    }
  }
}

async function main() {
  console.log('Gemini 3 Flash Demo App');
  console.log('======================');

  await basicGeneration();
  await streamingGeneration();
  await toolCallSingle();
  await toolCallRepeated();
  await chatWithTools();

  console.log('\n=== Demo Complete ===');
}

main().catch(console.error);
