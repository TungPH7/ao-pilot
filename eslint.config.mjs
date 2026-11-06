import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(globalIgnores(['dist/', 'coverage/', 'test-results/', 'playwright-report/', '.ai/', '.ai-orchestrator/', '.claude/']), js.configs.recommended, tseslint.configs.recommended);
