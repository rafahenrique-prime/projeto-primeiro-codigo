const SUPABASE_URL = "https://mbbgqasvssueirynnoyk.supabase.co"
const SUPABASE_KEY = "sb_publishable_RliDhy3CwEL-8eOw7EuwEQ_Ekpj9IPV"

const response = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id`, {
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  }
})

const data = await response.json()
console.log(`\n📊 TOTAL DE PRODUTOS NO SUPABASE: ${data.length}\n`)
