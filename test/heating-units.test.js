'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeUnit,isCelsiusUnit}=require('../lib/heating-units');

test('normalizes actual Homematic degree glyph before Unicode compatibility folding',()=>{
 for(const [input,expected]of [[undefined,''],[null,''],['ºC','°c'],[' º C\u00a0','°c'],['℃','°c'],[' Grad\tCelsius ','gradcelsius'],['ºF','°f'],['℉','°f'],[' K ','k']]){
  assert.equal(normalizeUnit(input),expected,JSON.stringify(input));
 }
});

test('accepts Celsius labels used by room, outdoor and setpoint adapters',()=>{
 for(const unit of [undefined,null,'','C','c','°C','ºC','º C','℃','° C','°c',' Celsius ','Grad','Grad C','Grad Celsius','degC','degree Celsius','degrees Celsius']){
  assert.equal(isCelsiusUnit(unit),true,JSON.stringify(unit));
 }
});

test('does not treat Fahrenheit, Kelvin or unrelated quantities as Celsius',()=>{
 for(const unit of ['°F','ºF','F','Fahrenheit','℉','K','°K','Kelvin','W','%','Temperatur','°C/kWh']){
  assert.equal(isCelsiusUnit(unit),false,JSON.stringify(unit));
 }
});
