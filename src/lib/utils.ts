import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function squeezeWhitespace(value: string): string {
  if (typeof value !== "string") {
    throw new TypeError("squeezeWhitespace expects a string input");
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized;
}
