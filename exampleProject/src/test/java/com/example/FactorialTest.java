package com.example;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class FactorialTest {
    @Test
    public void testFactorial() {
        assertEquals(1L, Factorial.factorial(0));
        assertEquals(1L, Factorial.factorial(1));
        assertEquals(2L, Factorial.factorial(2));
        assertEquals(6L, Factorial.factorial(3));
        assertEquals(24L, Factorial.factorial(4));
        assertEquals(120L, Factorial.factorial(5));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testNegative() {
        Factorial.factorial(-1);
    }

    @Test(expected = IllegalArgumentException.class)
    public void testOverflow() {
        Factorial.factorial(21);
    }

    @Test
    public void testLargeFactorial() {
        assertEquals(2432902008176640000L, Factorial.factorial(20));
    }
}
