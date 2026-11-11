'use strict';
// Loaded only by test/integration.js in an isolated test controller.
// No production adapter or external device is contacted by this fixture.
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,...args)=>{
 const url=typeof input==='string'?input:input?.url;
 if(typeof url==='string'&&url.startsWith('https://api.github.com/repos/stephanflug/ioBroker.energiemanagement/releases'))return Promise.reject(Error('GitHub deliberately offline in the isolated integration test'));
 return originalFetch(input,...args);
};
