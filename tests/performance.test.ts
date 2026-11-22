import assert from 'node:assert/strict';
import {validPerformance,type PerformanceMeasure} from '../src/performanceModel.ts';
const measure:PerformanceMeasure={id:'leads',performanceMeasure:true,title:'Qualified enquiries',unitIds:[],target:50,actual:42,unit:'Enquiries',direction:'At least',periodStart:'2026-11-01',periodEnd:'2026-11-30',measuredAt:'2026-11-21',source:'CRM export reviewed by marketing',sourceUrl:'https://example.test/report',campaignId:''};
assert.ok(validPerformance(measure));
for(const change of [{actual:Infinity},{source:''},{periodEnd:'2026-10-01'},{periodStart:'2026-02-30'},{sourceUrl:'javascript:alert(1)'},{measuredAt:''}])assert.equal(validPerformance({...measure,...change}),false);
console.log('Performance periods, numeric results and evidence validation passed.');
