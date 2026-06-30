# ==========================================
# THE SYSTEM - AI BACKEND (agent.py)
# ==========================================

import asyncio
import json
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from google.antigravity import Agent, LocalAgentConfig

# Manually load the local .env file to avoid external dependencies like python-dotenv
def load_env():
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    key_val = line.split('=', 1)
                    if len(key_val) == 2:
                        key, val = key_val[0].strip(), key_val[1].strip()
                        os.environ[key] = val
                        # Strip optional quotes
                        if val.startswith('"') and val.endswith('"'):
                            os.environ[key] = val[1:-1]
                        elif val.startswith("'") and val.endswith("'"):
                            os.environ[key] = val[1:-1]

load_env()

# Verify that the API key is present
if 'GEMINI_API_KEY' not in os.environ:
    print("[WARNING] GEMINI_API_KEY is not set. The agent may fail to initialize.")
    print("Please ensure your API key is in the .env file in the same directory.")

# Define the system instructions for the Solo Leveling System Guide persona
SYSTEM_INSTRUCTIONS = """
You are "The System", the mysterious, glowing blue AI interface from the anime/manhwa "Solo Leveling".
You refer to the user as "Hunter asheejajayan".
Your tone is mechanical, cold, objective, yet secretly supportive and highly authoritative.
You speak in short, concise, and structured sentences, often using brackets like [SYSTEM] or [QUEST] or [WARNING] or [ALERT].
You know the user's stats:
- Name: Hunter asheejajayan
- Age: 22
- Height: 6'0" (183 cm)
- Current Weight (HP): 105 kg
- Target Weight: 75 kg
- Level: 1 (increases by 1 for every 1 kg lost, up to Level 30 at 75 kg)
- Daily Calorie Budget: 2,888 kcal (TDEE/maintenance)

Your job is to act as the System Guide for their weight loss journey.
When they talk to you, evaluate their progress.
If they ask to buy or eat a cheat meal (like Lasagna, which costs 800 Gold), check their current Gold. If they have enough, approve the purchase. If they do not, deny it and tell them how many more steps or workouts they need to perform.
Keep your responses short, punchy, and highly immersive. Do not write long paragraphs.
"""

class SystemRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress default request logging to keep terminal clean
        pass

    def do_OPTIONS(self):
        # Handle CORS preflight requests
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/chat':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                message = data.get('message', '')
                player_stats = data.get('player_stats', {})
                
                # Construct a contextual prompt including the live player stats
                prompt = f"""
                User Message: {message}
                
                Current Live Player Stats:
                - Level: {player_stats.get('level', 1)}
                - HP (Weight): {player_stats.get('hp', 105.0)} kg
                - Gold: {player_stats.get('gold', 0)}
                - Steps Walked Today: {player_stats.get('steps', 0)} / 20000
                - Water Drunk: {player_stats.get('water', 0.0)} / 3.0 L
                - Active Workout Time: {player_stats.get('workout', 0)} / 45 min
                - Net Calorie Debt: {player_stats.get('net_debt', 2888)} kcal
                """
                
                # Call the async Antigravity SDK agent
                response_text = asyncio.run(chat_with_agent(prompt))
                
                # Send success response
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                response_data = {'response': response_text}
                self.wfile.write(json.dumps(response_data).encode('utf-8'))
                
            except Exception as e:
                # Handle errors gracefully
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                error_data = {'response': f"[SYSTEM ERROR] Failed to process request. Error: {str(e)}"}
                self.wfile.write(json.dumps(error_data).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

async def chat_with_agent(prompt):
    # Initialize the Google Antigravity Agent using the LocalAgentConfig
    config = LocalAgentConfig(
        system_instructions=SYSTEM_INSTRUCTIONS,
        model="gemini-3.5-flash"
    )
    async with Agent(config=config) as agent:
        response = await agent.chat(prompt)
        return await response.text()

def run_server():
    server_address = ('', 5000)
    try:
        httpd = HTTPServer(server_address, SystemRequestHandler)
        print("==================================================")
        print("  THE SYSTEM - Antigravity SDK Backend Active")
        print("  Listening on: http://localhost:5000")
        print("==================================================")
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down The System...")
        sys.exit(0)
    except Exception as e:
        print(f"Failed to start server: {e}")
        sys.exit(1)

if __name__ == '__main__':
    run_server()
