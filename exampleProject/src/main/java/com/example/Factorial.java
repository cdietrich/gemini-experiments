package com.example;

public final class Factorial {
    private Factorial() {}

    public static long factorial(int n) {
        if (n < 0) {
            throw new IllegalArgumentException("n must be non-negative");
        }
        if (n > 20) {
            throw new IllegalArgumentException("n must be 20 or less to avoid long overflow");
        }
        long result = 1;
        for (int i = 2; i <= n; i++) {
            result *= i;
        }
        return result;
    }
}
