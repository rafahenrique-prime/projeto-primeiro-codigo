#!/usr/bin/env python3
"""
Script para encerrar atendimento manualmente
"""
import sys
import json
from pathlib import Path

def close_conversation(buyer_id: str, channel: str):
    """Marca conversa como encerrada"""
    workspace = Path(f"buyer_agents/buyer_{buyer_id}_{channel}_workspace")
    user_md = workspace / "USER.md"
    
    if not user_md.exists():
        print(f"❌ Conversa não encontrada: {buyer_id}/{channel}")
        return False
    
    content = user_md.read_text()
    
    # Adiciona ou atualiza status
    if "- **Status:**" in content:
        content = content.replace("- **Status:** active", "- **Status:** closed")
        content = content.replace("- **Status:** Active", "- **Status:** closed")
    else:
        # Adiciona status no final
        content += "\n- **Status:** closed\n"
    
    user_md.write_text(content)
    print(f"✅ Atendimento encerrado: {buyer_id}/{channel}")
    return True

def reopen_conversation(buyer_id: str, channel: str):
    """Reabre conversa encerrada"""
    workspace = Path(f"buyer_agents/buyer_{buyer_id}_{channel}_workspace")
    user_md = workspace / "USER.md"
    
    if not user_md.exists():
        print(f"❌ Conversa não encontrada: {buyer_id}/{channel}")
        return False
    
    content = user_md.read_text()
    content = content.replace("- **Status:** closed", "- **Status:** active")
    user_md.write_text(content)
    print(f"✅ Atendimento reaberto: {buyer_id}/{channel}")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python3 close_conversation.py <close|reopen> <buyer_id> <channel>")
        print("Example: python3 close_conversation.py close 280038 whatsapp")
        sys.exit(1)
    
    action = sys.argv[1]
    buyer_id = sys.argv[2]
    channel = sys.argv[3]
    
    if action == "close":
        close_conversation(buyer_id, channel)
    elif action == "reopen":
        reopen_conversation(buyer_id, channel)
    else:
        print(f"❌ Ação inválida: {action}")
        sys.exit(1)
