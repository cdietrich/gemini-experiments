package com.example;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class FibonacciTest {
    @Test
    public void testFibonacci() {
        assertEquals(0L, Fibonacci.fibonacci(0));
        assertEquals(1L, Fibonacci.fibonacci(1));
        assertEquals(1L, Fibonacci.fibonacci(2));
        assertEquals(2L, Fibonacci.fibonacci(3));
        assertEquals(3L, Fibonacci.fibonacci(4));
        assertEquals(5L, Fibonacci.fibonacci(5));
        assertEquals(8L, Fibonacci.fibonacci(6));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testNegative() {
        Fibonacci.fibonacci(-1);
    }

    @Test(expected = IllegalArgumentException.class)
    public void testOverflow() {
        Fibonacci.fibonacci(93);
    }

    @Test
    public void testLargeFibonacci() {
        // F(46) 
        assertEquals(1836311903L, Fibonacci.fibonacci(46));
        // F(50) = 12586269025
        assertEquals(12586269025L, Fibonacci.fibonacci(50));
        // F(92) is the largest Fibonacci number that fits in a 64-bit signed integer
        assertEquals(7540113804746346429L, Fibonacci.fibonacci(92));
    }
}
