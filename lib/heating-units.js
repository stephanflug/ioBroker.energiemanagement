'use strict';
// ReGa system variables can use ºC (ordinal sign) or just "Grad".
// These are labels only: all heating values are still interpreted as Celsius.
const CELSIUS_UNITS=new Set(['','c','°c','celsius','grad','gradc','gradcelsius','degc','degreecelsius','degreescelsius']);
function normalizeUnit(value){
 return String(value??'').replace(/º/g,'°').normalize('NFKC').toLowerCase().replace(/\s/g,'');
}
const isCelsiusUnit=value=>CELSIUS_UNITS.has(normalizeUnit(value));
module.exports={normalizeUnit,isCelsiusUnit};
