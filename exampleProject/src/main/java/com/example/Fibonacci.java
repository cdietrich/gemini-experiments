package com.example;

public final class Fibonacci {
    private Fibonacci() {}

    public static long fibonacci(int n) {
        if (n < 0) {
            throw new IllegalArgumentException("n must be non-negative");
        }
        if (n > 92) {
            throw new IllegalArgumentException("n must be 92 or less to avoid long overflow");
        }
        if (n <= 1) {
            return n;
        }
        long fib = 1;
        long prevFib = 1;

        for (int i = 2; i < n; i++) {
            long temp = fib;
            fib += prevFib;
            prevFib = temp;
        }
        return fib;
    }
}
