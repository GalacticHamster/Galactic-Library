import {kindleCategoryTests} from './kindle-categories.js';
﻿import {genreClassificationTests} from './genre-classification.js';
for(const [name,run] of [...genreClassificationTests,...kindleCategoryTests]){await run();console.log('PASS '+name);}
