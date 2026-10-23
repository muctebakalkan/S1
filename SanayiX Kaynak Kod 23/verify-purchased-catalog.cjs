const fs=require('node:fs'),assert=require('node:assert/strict');
const dir=process.argv[2];if(!dir)throw Error('Provide the private import directory.');
const entries=JSON.parse(fs.readFileSync(dir+'/entries.json'));
const checks=[['Fiat','Egea',7],['Renault','Clio',20],['Renault','Megane',21],['Ford','Tourneo Courier',4],['Ford','Transit Courier',7],['Ford','Focus',14],['Volkswagen','Golf',15],['Volkswagen','Passat',19],['Toyota','Corolla',9],['Hyundai','i20',6],['Peugeot','3008',10],['Opel','Astra',19],['BMW','iX',3],['BMW','iX1',2],['BMW','X1',9],['BMW','X5',11],['Audi','Q8',3],['Lexus','RX',5],['Fiat','500 Ailesi',13]];
for(const [brand,model,count] of checks){
 const b=entries.find(e=>e.kind==='brand'&&e.name===brand);assert.ok(b,brand);
 const m=entries.find(e=>e.kind==='model'&&e.name===model&&e.parent_id===b.id);assert.ok(m,model);
 const engines=entries.filter(e=>e.kind==='variant'&&e.parent_id===m.id);assert.equal(engines.length,count,model);
 assert.ok(engines.every(e=>!e.name.includes('00:00:00')&&!('yearFrom'in e)));
 console.log(brand,model,engines.length);
}
assert.ok(!entries.some(e=>[6140,6141,6142,12486,12487,12488].includes(e.id)));
console.log('Requested models and engine counts passed; source gaps preserved.');
