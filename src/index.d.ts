export * from './core.js';
import type { Report, Finding } from './core.js';
export declare const RULES: Record<string, { severity: string; title: string }>;
export interface FileSize { file: string; name: string; kind: 'js' | 'css'; raw: number; gzip: number; brotli?: number; sha: string; unminified?: boolean }
export interface Budget { path: string; raw?: number; gzip?: number; brotli?: number; src?: string }
export declare function parseSize(v: string | number): number | null;
export declare function fmtSize(n: number): string;
export declare function stableName(file: string): string;
export declare function measure(buf: Buffer, opts?: { brotli?: boolean }): { raw: number; gzip: number; brotli?: number };
export declare function scan(dir: string, opts?: { include?: string[]; exclude?: string[] }): FileSize[];
export declare function normaliseBudgets(config?: unknown, cli?: string[]): Budget[];
export declare function analyze(files: FileSize[], opts?: Record<string, unknown>): Finding[];
export declare function snapshot(files: FileSize[], meta?: Record<string, unknown>): { schema: string; generatedAt: string; files: FileSize[] };
export declare function check(dir: string, opts?: { budget?: string[]; totalJs?: string; totalCss?: string; include?: string[]; exclude?: string[]; base?: string; baseOptional?: boolean; maxGrowth?: number; snapshot?: string; toolVersion?: string }, config?: Record<string, unknown>, configFile?: string): Report;
