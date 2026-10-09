import {genreClassificationTests} from './genre-classification.js';
for(const [name,run] of genreClassificationTests){await run();console.log('PASS '+name);}
