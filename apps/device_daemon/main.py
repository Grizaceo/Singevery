import asyncio
import logging
import json
import websockets
from libs.sync.engine import SyncEngine
from tools.simulator.sim_engine import Simulator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("DeviceDaemon")

CONNECTED_CLIENTS = set()

async def handler(websocket):
    CONNECTED_CLIENTS.add(websocket)
    try:
        await websocket.wait_closed()
    finally:
        CONNECTED_CLIENTS.remove(websocket)

async def broadcast_state(model):
    if not CONNECTED_CLIENTS:
        return
    
    # Pydantic v2 use model_dump_json(), v1 use json()
    # Assuming v2 since we installed latest
    try:
        message = model.model_dump_json()
    except AttributeError:
        message = model.json()
        
    tasks = [asyncio.create_task(ws.send(message)) for ws in CONNECTED_CLIENTS]
    await asyncio.gather(*tasks, return_exceptions=True)

async def main():
    logger.info("Starting Device Daemon (Simulator Mode)...")
    
    # Initialize Core
    sync_engine = SyncEngine()
    simulator = Simulator(sync_engine)
    
    track = simulator.load_demo_track()
    logger.info(f"Loaded demo track: {track.title}")
    
    # Start WebSocket Server
    async with websockets.serve(handler, "localhost", 8000):
        logger.info("WebSocket Server listening on ws://localhost:8000")
        
        # Start Simulation
        await simulator.start()
        
        try:
            while True:
                pos = simulator.get_current_position()
                
                # Update Sync Engine
                model = sync_engine.get_render_model(pos, status="DISPLAYING")
                model.track_title = track.title
                model.track_artist = track.artist
                
                # Broadcast
                await broadcast_state(model)
                
                # 20 Hz update rate
                await asyncio.sleep(0.05)
                
        except asyncio.CancelledError:
            logger.info("Main loop cancelled")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down...")
