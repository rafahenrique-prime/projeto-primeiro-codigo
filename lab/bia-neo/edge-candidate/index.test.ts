// LAB-42: actual Edge handler with FAKE credentials and an offline catalogue only.
type Handler=(r:Request)=>Response|Promise<Response>;
function ok(c:unknown,m:string):asserts c {if(!c)throw new Error(m)}
function eq(a:unknown,b:unknown,m:string){ok(Object.is(a,b),m+" ("+String(a)+" vs "+String(b)+")")}
const labId="BIA_LAB_TEST_001",labKey="LAB42_FAKE_ONLY_"+"x".repeat(64);
Deno.env.set("PRIME_CONTROL_BIA_AGENT_ID",labId);
Deno.env.set("PRIME_CONTROL_BIA_LAB_READ_KEY",labKey);
Deno.env.set("SUPABASE_URL","https://synthetic-only.invalid");
Deno.env.set("SUPABASE_ANON_KEY","FAKE_ANON_KEY_LAB42");
const products=[
{id:"11111111-1111-4111-8111-111111111111",slug:"nike-air-force-1",nome:"Tênis Nike Air Force 1",marca:"Nike",categoria_nome:"Tênis",descricao:"",codigo:"",preco:399,ativo:true,selling_out_of_stock:false,link:"https://www.primestoremen.com.br/tenis-nike-air-force-1",imagem_principal:"https://cdn.dooca.store/161486/products/force.jpg"},
{id:"22222222-2222-4222-8222-222222222222",slug:"louis-vuitton-lv-skate-branco",nome:"Tênis Louis Vuitton LV Skate Branco",marca:"Louis Vuitton",categoria_nome:"Tênis",descricao:"",codigo:"",preco:850,ativo:true,selling_out_of_stock:false,link:"https://www.primestoremen.com.br/louis-vuitton-lv-skate-branco",imagem_principal:"https://cdn.dooca.store/161486/products/skate.jpg"},
{id:"33333333-3333-4333-8333-333333333333",slug:"vans-bege",nome:"Tênis Vans Ultrarange Neo Bege",marca:"Vans",categoria_nome:"Tênis",descricao:"",codigo:"",preco:299,ativo:true,selling_out_of_stock:false,link:"https://www.primestoremen.com.br/tenis-vans-bege",imagem_principal:"https://cdn.dooca.store/161486/products/vans.jpg"},
{id:"44444444-4444-4444-8444-444444444444",slug:"camiseta-preta",nome:"Camiseta Abercrombie Preta",marca:"Abercrombie",categoria_nome:"Camisetas Premium",descricao:"",codigo:"",preco:179,ativo:true,selling_out_of_stock:false,link:"https://www.primestoremen.com.br/camiseta-preta",imagem_principal:"https://cdn.dooca.store/161486/products/tee.jpg"}
];
const variants=[
{shadow_product_id:products[0].id,attributes:{tamanho:"40"},stock_quantity:2},
{shadow_product_id:products[1].id,attributes:{tamanho:"34"},stock_quantity:0},
{shadow_product_id:products[2].id,attributes:{tamanho:"40"},stock_quantity:2},
{shadow_product_id:products[3].id,attributes:{tamanho:"M"},stock_quantity:null}
];
const oldFetch=globalThis.fetch,oldServe=Deno.serve;
let handler:Handler|undefined;
Object.defineProperty(Deno,"serve",{configurable:true,writable:true,value:(fn:Handler)=>{handler=fn;return {}}});
globalThis.fetch=((input:Request|string|URL)=>{
const url=String(input instanceof Request?input.url:input);
if(url.startsWith("https://synthetic-only.invalid/rest/v1/shadow_products?"))return Promise.resolve(Response.json(products));
if(url.startsWith("https://synthetic-only.invalid/rest/v1/shadow_product_variations?"))return Promise.resolve(Response.json(variants.filter(v=>url.includes(v.shadow_product_id))));
return Promise.reject(new Error("NETWORK_DISABLED_LAB42"));
}) as typeof fetch;
try{await import("./index.ts")}finally{Object.defineProperty(Deno,"serve",{configurable:true,writable:true,value:oldServe})}
ok(handler,"Missing actual Edge handler");
const good={"x-prime-agent-id":labId,"x-prime-bia-key":labKey};
async function call(pergunta:string,headers:Record<string,string>={},method="POST"){
const req=new Request("https://offline-bia.invalid/test",{method,headers,...(method==="POST"?{body:JSON.stringify({pergunta})}:{})});
const res=await handler!(req);
return {status:res.status,body:await res.json()};
}
function candidates(body:any):any[]{return body?.dados?.produtos??[]}
function safe(body:any){
eq(body?.contexto?.source,"PRIME_SHADOW_READ_ONLY","BIA source");
eq(body?.contexto?.preco_atual_verificado,false,"Price unverified");
eq(body?.contexto?.estoque_atual_verificado,false,"Stock unverified");
for(const p of candidates(body)){
eq(p.confirmacao,"CANDIDATO_NAO_CONFIRMADO","Candidate status");
for(const f of ["preco","precoPix","precoTabela","estoque","disponibilidade","estoque_confirmado","variacoes"])ok(!(f in p),"Leaked "+f);
}
}
Deno.test("Reject missing credentials",async()=>eq((await call("Nike Air Force")).status,403,"access"));
Deno.test("Reject unknown agent",async()=>eq((await call("Nike Air Force",{...good,"x-prime-agent-id":"SOME_OTHER_AGENT"})).status,403,"access"));
Deno.test("Reject invalid key",async()=>eq((await call("Nike Air Force",{...good,"x-prime-bia-key":"bad"})).status,403,"access"));
Deno.test("Reject old GABY-LAB header",async()=>eq((await call("Nike Air Force",{"x-prime-lab":"GABY-LAB-COMERCIAL-V1"})).status,403,"access"));
Deno.test("Reject GET",async()=>eq((await call("Nike Air Force",good,"GET")).status,405,"method"));
Deno.test("Air Force not hidden by historical budget",async()=>{
const r=await call("Tênis Nike Air Force 1 até 300",good);eq(r.status,200,"status");ok(candidates(r.body).some(p=>p.nome.includes("Air Force")),"Missing Air Force");safe(r.body);
});
Deno.test("LV Skate size 34 remains despite historic stock zero",async()=>{
const r=await call("Tênis Louis Vuitton LV Skate Branco tamanho 34",good);eq(r.status,200,"status");ok(candidates(r.body).some(p=>p.nome.includes("Skate")),"Missing Skate");safe(r.body);
});
Deno.test("Vans bege 40 is candidate, never confirmed stock",async()=>{
const r=await call("Tênis Vans bege 40",good);eq(r.status,200,"status");ok(candidates(r.body).some(p=>p.nome.includes("Vans")),"Missing Vans");safe(r.body);
});
Deno.test("Camiseta preta M found with unknown stock",async()=>{
const r=await call("Camiseta preta M",good);eq(r.status,200,"status");ok(candidates(r.body).some(p=>p.nome.includes("Camiseta")),"Missing shirt");safe(r.body);
});
Deno.test("Unknown model does not invent candidates",async()=>{
const r=await call("modelo zx987654ficticio",good);eq(r.status,200,"status");eq(candidates(r.body).length,0,"not empty");
});
Deno.test("Empty message fails closed",async()=>{
const r=await call("",good);ok(r.status===400||candidates(r.body).length===0,"Empty msg");
});
