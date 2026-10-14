const {test}=require('node:test');
const assert=require('node:assert/strict');
const {projectEnvironment}=require('../dist/utils/projectEnvironment');
test('project environment removes platform settings while honoring explicit project variables',t=>{
 const previous={CORS_ORIGINS:process.env.CORS_ORIGINS,DB_PASSWORD:process.env.DB_PASSWORD,ADMIN_PASSWORD:process.env.ADMIN_PASSWORD};
 t.after(()=>{for(const[k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 process.env.CORS_ORIGINS='http://localhost:5173';process.env.DB_PASSWORD='platform-only';process.env.ADMIN_PASSWORD='platform-admin';
 const clean=projectEnvironment();assert.equal(clean.CORS_ORIGINS,undefined);assert.equal(clean.DB_PASSWORD,undefined);assert.equal(clean.ADMIN_PASSWORD,undefined);
 assert.equal(clean.PATH,process.env.PATH);
 const configured=projectEnvironment({CORS_ORIGINS:'["https://project.example"]',DB_PASSWORD:'project-only'});
 assert.equal(configured.CORS_ORIGINS,'["https://project.example"]');assert.equal(configured.DB_PASSWORD,'project-only');
});
