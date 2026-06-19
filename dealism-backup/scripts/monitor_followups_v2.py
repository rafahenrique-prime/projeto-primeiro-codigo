#!/usr/bin/env python3
"""
Monitor de follow-ups automático - V2 com suporte a encerramento
"""
import os
import json
import time
from pathlib import Path
from datetime import datetime

WORKSPACE_ROOT = Path("buyer_agents")
THRESHOLDS = {
    "30min": 30 * 60,
    "23h45min": 23 * 60 * 60 + 45 * 60,
    "24h": 24 * 60 * 60
}

def is_conversation_closed(buyer_workspace: Path) -> bool:
    """Verifica se conversa está encerrada"""
    user_md = buyer_workspace / "USER.md"
    if not user_md.exists():
        return False
    
    content = user_md.read_text()
    return "- **Status:** closed" in content

def get_inactive_buyers():
    """Retorna buyers inativos organizados por tempo"""
    result = {k: [] for k in THRESHOLDS.keys()}
    now = time.time()
    
    for buyer_dir in WORKSPACE_ROOT.glob("buyer_*_workspace"):
        # Verifica se conversa está encerrada
        if is_conversation_closed(buyer_dir):
            continue  # Pula conversas encerradas
        
        # Parse buyer_id e channel do nome do diretório
        parts = buyer_dir.name.replace("buyer_", "").replace("_workspace", "").rsplit("_", 1)
        if len(parts) != 2:
            continue
        
        buyer_id, channel = parts
        session_file = buyer_dir / "sessions" / f"seller:38537:buyer:{buyer_id}:{channel}.jsonl"
        
        if not session_file.exists():
            continue
        
        # Lê última linha do JSONL
        try:
            with open(session_file, 'r') as f:
                lines = f.readlines()
                if not lines:
                    continue
                
                last_msg = json.loads(lines[-1])
                last_ts = last_msg.get("timestamp", 0)
                inactive_time = now - last_ts
                
                # Classifica por faixa de tempo
                for threshold_name, threshold_seconds in THRESHOLDS.items():
                    if inactive_time >= threshold_seconds:
                        result[threshold_name].append({
                            "buyer_id": buyer_id,
                            "channel": channel,
                            "inactive_seconds": int(inactive_time)
                        })
                        break  # Só adiciona na primeira faixa que atingir
        
        except Exception as e:
            continue
    
    return result

if __name__ == "__main__":
    inactive = get_inactive_buyers()
    print(json.dumps(inactive, indent=2))
