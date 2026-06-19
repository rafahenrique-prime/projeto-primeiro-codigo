#!/usr/bin/env python3
"""
Worker de monitoramento automático de follow-ups - COM CONTROLE DE ENVIO ÚNICO
"""
import json
import os
import re
from datetime import datetime

BINDINGS_PATH = "buyer_agents/bindings.json"
WORKSPACE_BASE = "buyer_agents"
SELLER_ID = "38537"
STATE_FILE = "workspace/memory/followup_sent_state.json"

def parse_buyer_key(key):
    match = re.match(r'buyer_(\d+)_(\w+)', key)
    if match:
        return match.group(1), match.group(2)
    return None, None

def load_sent_state():
    """Carrega estado de follow-ups já enviados"""
    try:
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, 'r') as f:
                return json.load(f)
        return {'sent': {}}
    except:
        return {'sent': {}}

def save_sent_state(state):
    """Salva estado de follow-ups enviados"""
    try:
        os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
        with open(STATE_FILE, 'w') as f:
            json.dump(state, f, indent=2)
    except:
        pass

def was_sent(buyer_id, channel, stage, state):
    """Verifica se já enviou follow-up nesse stage"""
    key = f"{buyer_id}_{channel}_{stage}"
    return key in state['sent']

def mark_as_sent(buyer_id, channel, stage, state):
    """Marca follow-up como enviado"""
    key = f"{buyer_id}_{channel}_{stage}"
    state['sent'][key] = {
        'timestamp': datetime.now().isoformat(),
        'buyer_id': buyer_id,
        'channel': channel,
        'stage': stage
    }

def get_all_active_buyers():
    try:
        with open(BINDINGS_PATH, 'r') as f:
            bindings = json.load(f)
            buyers = []
            for key in bindings.get('bindings', {}).keys():
                buyer_id, channel = parse_buyer_key(key)
                if buyer_id and channel and channel in ['whatsapp', 'instagram']:
                    buyers.append({'buyer_id': buyer_id, 'channel': channel})
            return buyers
    except:
        return []

def get_last_message_time(buyer_id, channel):
    session_file = f"{WORKSPACE_BASE}/buyer_{buyer_id}_{channel}_workspace/sessions/seller:{SELLER_ID}:buyer:{buyer_id}:{channel}.jsonl"
    if not os.path.exists(session_file):
        return None
    try:
        with open(session_file, 'r') as f:
            lines = f.readlines()
            for line in reversed(lines):
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                    return msg.get('timestamp')
                except:
                    continue
        return None
    except:
        return None

def calculate_inactive_minutes(last_timestamp):
    if not last_timestamp:
        return None
    try:
        # Suporta AMBOS os formatos: ISO string e Unix epoch
        if isinstance(last_timestamp, (int, float)):
            # Unix epoch (float)
            last_time = datetime.fromtimestamp(last_timestamp)
        else:
            # ISO string
            last_time = datetime.fromisoformat(last_timestamp.replace('Z', '+00:00'))
        
        now = datetime.now(last_time.tzinfo) if last_time.tzinfo else datetime.now()
        diff = now - last_time
        return int(diff.total_seconds() / 60)
    except Exception as e:
        return None

def main():
    # Carrega estado de envios anteriores
    state = load_sent_state()
    active_buyers = get_all_active_buyers()
    
    to_send = {'30min': [], '23h45min': [], '24h': []}
    
    for buyer in active_buyers:
        buyer_id = buyer['buyer_id']
        channel = buyer['channel']
        
        last_msg_time = get_last_message_time(buyer_id, channel)
        if not last_msg_time:
            continue
        
        inactive_mins = calculate_inactive_minutes(last_msg_time)
        if inactive_mins is None:
            continue
        
        # Follow-up de 30min (apenas 1 vez)
        if 30 <= inactive_mins < 1425:
            if not was_sent(buyer_id, channel, '30min', state):
                to_send['30min'].append({'buyer_id': buyer_id, 'channel': channel, 'inactive_mins': inactive_mins})
                mark_as_sent(buyer_id, channel, '30min', state)
        
        # Follow-up de 23h45min (apenas 1 vez)
        elif 1425 <= inactive_mins < 1440:
            if not was_sent(buyer_id, channel, '23h45min', state):
                to_send['23h45min'].append({'buyer_id': buyer_id, 'channel': channel, 'inactive_mins': inactive_mins})
                mark_as_sent(buyer_id, channel, '23h45min', state)
        
        # Follow-up de 24h (apenas 1 vez)
        elif inactive_mins >= 1440:
            if not was_sent(buyer_id, channel, '24h', state):
                to_send['24h'].append({'buyer_id': buyer_id, 'channel': channel, 'inactive_mins': inactive_mins})
                mark_as_sent(buyer_id, channel, '24h', state)
    
    # Salva estado atualizado
    save_sent_state(state)
    
    print(json.dumps(to_send, indent=2))

if __name__ == '__main__':
    main()
