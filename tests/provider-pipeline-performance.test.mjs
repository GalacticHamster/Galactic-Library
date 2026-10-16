import test from 'node:test';
import {providerPipelinePerformanceTests} from './provider-pipeline-performance.js';
for(const [name,run]of providerPipelinePerformanceTests)test(name,run);
