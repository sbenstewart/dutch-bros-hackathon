import os
import boto3
import uvicorn
import asyncio
import httpx
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, time
import uuid
from dotenv import load_dotenv
import json
import api_pipeline as api

# Import the AWS Transcribe Streaming SDK
from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.handlers import TranscriptResultStreamHandler
from amazon_transcribe.model import TranscriptEvent

# Import notification service
from notification_service import NotificationService, Notification, NotificationType, NotificationPriority

# --- Configuration ---
load_dotenv()

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION")

DUTCH_BROS_API_BASE_URL = os.getenv("DUTCH_BROS_API_BASE_URL", "https://pos-api.example.com/v1")
DUTCH_BROS_API_KEY = os.getenv("DUTCH_BROS_API_KEY")

if not all([AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION]):
    print("--------------------------------------------------")
    print("FATAL ERROR: Missing AWS configuration in .env file.")
    print("--------------------------------------------------")

if not DUTCH_BROS_API_KEY:
    print("--------------------------------------------------")
    print("WARNING: Missing DUTCH_BROS_API_KEY in .env file.")
    print("--------------------------------------------------")

# --- FastAPI App ---
app = FastAPI()

# --- CORS Middleware ---
origins = [
    "http://localhost:4200",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Global State ---
notification_service = NotificationService()
simulated_time: Optional[datetime] = None
active_notification_websockets: List[WebSocket] = []

# --- Models ---
class OrderItem(BaseModel):
    product_id: str
    name: str
    category: str
    size: str
    quantity: int
    unit_price: float
    child_items: List[Dict[str, Any]] = []

class SubmitOrderRequest(BaseModel):
    customer_name: str
    items: List[OrderItem]
    notes: Optional[str] = None

class OrderResponse(BaseModel):
    status: str
    message: str
    order_id: str
    timestamp: str

class SetTimeRequest(BaseModel):
    time: str  # Format: "HH:MM"

# --- Helper Functions ---
def get_current_time() -> datetime:
    """Get current time (simulated or real)"""
    if simulated_time:
        return simulated_time
    return datetime.now()

async def broadcast_notification(notification: Notification):
    """Send notification to all connected WebSocket clients"""
    notification_data = notification.to_dict()
    print(f"📢 Broadcasting notification: {notification.title}")
    
    disconnected = []
    for ws in active_notification_websockets:
        try:
            await ws.send_json(notification_data)
        except Exception as e:
            print(f"Failed to send to client: {e}")
            disconnected.append(ws)
    
    # Remove disconnected clients
    for ws in disconnected:
        active_notification_websockets.remove(ws)

def check_and_generate_notifications(current_time: datetime):
    """Check time and generate appropriate notifications"""
    hour = current_time.hour
    
    # Morning rush approaching (6 AM)
    if hour == 6:
        notif = Notification(
            notification_id=notification_service.generate_notification_id(),
            type=NotificationType.PEAK_APPROACHING,
            priority=NotificationPriority.HIGH,
            title="⚠️ Morning Rush Approaching",
            message="Peak hours (7:00-10:00 AM) begin soon. Prepare stations!",
            timestamp=current_time,
            action="prep_rush"
        )
        notification_service.add_notification(notif)
        return notif
    
    # Morning peak active (7-10 AM)
    elif hour >= 7 and hour < 10:
        notif = Notification(
            notification_id=notification_service.generate_notification_id(),
            type=NotificationType.PEAK_ACTIVE,
            priority=NotificationPriority.MEDIUM,
            title="🔥 Morning Peak Active",
            message=f"Currently in morning peak (7:00-10:00 AM). High volume expected.",
            timestamp=current_time
        )
        notification_service.add_notification(notif)
        return notif
    
    # Lunch rush approaching (11 AM)
    elif hour == 11:
        notif = Notification(
            notification_id=notification_service.generate_notification_id(),
            type=NotificationType.PEAK_APPROACHING,
            priority=NotificationPriority.HIGH,
            title="⚠️ Lunch Rush Approaching",
            message="Lunch peak (12:00-2:00 PM) begins soon. Restock popular items!",
            timestamp=current_time,
            action="prep_rush"
        )
        notification_service.add_notification(notif)
        return notif
    
    # Afternoon slow period (2-4 PM)
    elif hour >= 14 and hour < 16:
        notif = Notification(
            notification_id=notification_service.generate_notification_id(),
            type=NotificationType.CLEANING_TIME,
            priority=NotificationPriority.LOW,
            title="🧹 Slow Period - Cleaning Time",
            message="Low traffic period. Good time for cleaning and restocking.",
            timestamp=current_time,
            action="start_cleaning"
        )
        notification_service.add_notification(notif)
        return notif
    
    # Evening rush prep (5 PM)
    elif hour == 17:
        notif = Notification(
            notification_id=notification_service.generate_notification_id(),
            type=NotificationType.RESTOCK,
            priority=NotificationPriority.MEDIUM,
            title="📦 Restock Before Evening Rush",
            message="Evening peak (7:00-10:00 PM) approaching. Restock popular items!",
            timestamp=current_time,
            action="restock"
        )
        notification_service.add_notification(notif)
        return notif
    
    # Evening rush active (7-10 PM)
    elif hour >= 19 and hour < 22:
        notif = Notification(
            notification_id=notification_service.generate_notification_id(),
            type=NotificationType.EVENING_RUSH,
            priority=NotificationPriority.HIGH,
            title="🌙 Evening Rush Active",
            message="Peak evening hours (7:00-10:00 PM). Expect high volume.",
            timestamp=current_time,
            action="evening_prep"
        )
        notification_service.add_notification(notif)
        return notif
    
    # Closing time (10 PM)
    elif hour == 22:
        notif = Notification(
            notification_id=notification_service.generate_notification_id(),
            type=NotificationType.CLOSING_TIME,
            priority=NotificationPriority.HIGH,
            title="🔒 Closing Time",
            message="Begin closing procedures. Clean equipment and prep for tomorrow.",
            timestamp=current_time,
            action="start_closing"
        )
        notification_service.add_notification(notif)
        return notif
    
    return None

# --- Time API Endpoints ---
@app.post("/api/time/set")
async def set_time(request: SetTimeRequest):
    """Set simulated time"""
    global simulated_time
    
    try:
        # Parse time string (HH:MM)
        time_parts = request.time.split(":")
        hour = int(time_parts[0])
        minute = int(time_parts[1])
        
        # Create datetime with today's date but specified time
        now = datetime.now()
        simulated_time = datetime(now.year, now.month, now.day, hour, minute)
        
        print(f"⏰ Time set to: {simulated_time.strftime('%H:%M')}")
        
        # Check if we should generate notifications for this time
        notification = check_and_generate_notifications(simulated_time)
        if notification:
            await broadcast_notification(notification)
        
        return {
            "status": "success",
            "time": simulated_time.strftime("%H:%M"),
            "message": f"Time set to {request.time}"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid time format: {str(e)}")

@app.post("/api/time/reset")
async def reset_time():
    """Reset to real time"""
    global simulated_time
    simulated_time = None
    
    print("⏰ Time reset to real time")
    
    return {
        "status": "success",
        "message": "Time reset to current time"
    }

@app.get("/api/time/current")
async def get_current_time_api():
    """Get current (simulated or real) time"""
    current = get_current_time()
    return {
        "time": current.strftime("%H:%M"),
        "is_simulated": simulated_time is not None,
        "timestamp": current.isoformat()
    }

# --- Notification WebSocket ---
@app.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket):
    """WebSocket endpoint for real-time notifications"""
    await websocket.accept()
    active_notification_websockets.append(websocket)
    
    print(f"🔌 Notification client connected. Total clients: {len(active_notification_websockets)}")
    
    try:
        # Send any existing active notifications
        for notification in notification_service.get_active_notifications():
            await websocket.send_json(notification)
        
        # Keep connection alive and listen for client messages
        while True:
            data = await websocket.receive_json()
            
            # Handle dismiss action
            if data.get("action") == "dismiss":
                notification_id = data.get("notification_id")
                if notification_id:
                    notification_service.dismiss_notification(notification_id)
                    print(f"❌ Dismissed notification: {notification_id}")
    
    except WebSocketDisconnect:
        print(f"🔌 Notification client disconnected")
    except Exception as e:
        print(f"Notification WebSocket error: {e}")
    finally:
        if websocket in active_notification_websockets:
            active_notification_websockets.remove(websocket)
        print(f"🔌 Total clients: {len(active_notification_websockets)}")

# --- Order Endpoint ---
@app.post("/submit-order", response_model=OrderResponse)
async def submit_order(order: SubmitOrderRequest):
    """Submit a new order to the Dutch Bros POS system"""
    try:
        order_items = []
        for item in order.items:
            modifiers = {}
            for mod in item.child_items:
                modifiers[mod['modifier_group']] = mod['name']
            
            # Build the item - do NOT include 'size' as a top-level field
            # when using the legacy modifiers format (size goes in modifiers object)
            order_items.append({
                "name": item.name,
                "category": item.category,
                "quantity": item.quantity,
                "modifiers": modifiers
            })
        
        api_payload = {
            "source": "online",
            "customer_name": order.customer_name,
            "items": order_items
        }
        
        if order.notes:
            api_payload["notes"] = order.notes
        
        print(f"\n{'='*60}")
        print(f"SUBMITTING ORDER TO DUTCH BROS API")
        print(f"{'='*60}")
        print(f"Customer: {order.customer_name}")
        print(f"Items: {len(order.items)}")
        
        import json
        print(f"\nRequest Body:")
        print(json.dumps(api_payload, indent=2))
        
        headers = {
            "Content-Type": "application/json",
            "x-api-key": DUTCH_BROS_API_KEY,
            "Idempotency-Key": str(uuid.uuid4())
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{DUTCH_BROS_API_BASE_URL}/orders",
                json=api_payload,
                headers=headers
            )
        
        if response.status_code == 202:
            result = response.json()
            order_data = result.get('data', {})
            order_id = order_data.get('order_id', f"ORD-{uuid.uuid4().hex[:8].upper()}")
            
            print(f"✓ Order submitted successfully: {order_id}")
            if 'kds_url' in order_data:
                print(f"✓ KDS URL: {order_data['kds_url']}")
            print(f"{'='*60}\n")
            
            return OrderResponse(
                status="success",
                message=f"Order submitted to Dutch Bros POS for {order.customer_name}",
                order_id=order_id,
                timestamp=datetime.now().isoformat()
            )
        else:
            error_detail = response.json() if response.text else {"error": "Unknown error"}
            error_message = error_detail.get('error', {}).get('message', response.text)
            print(f"✗ API Error ({response.status_code}): {error_message}")
            print(f"{'='*60}\n")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Dutch Bros API error: {error_message}"
            )
        
    except httpx.RequestError as e:
        print(f"✗ Network error: {e}")
        print(f"{'='*60}\n")
        raise HTTPException(
            status_code=503,
            detail=f"Failed to connect to Dutch Bros API: {str(e)}"
        )
    except Exception as e:
        print(f"✗ Error: {e}")
        print(f"{'='*60}\n")
        raise HTTPException(status_code=500, detail=f"Failed to process order: {str(e)}")


# --- WebSocket Audio Stream ---

async def assemble_transcript(transcript_queue: asyncio.Queue):
    """
    Continuously collects final transcript segments and merges them into one text.
    """
    full_transcript = ""
    while True:
        text_chunk = await transcript_queue.get()
        if text_chunk is None:
            break  # End signal
        full_transcript += " " + text_chunk
    return full_transcript.strip()


async def audio_stream_generator(audio_queue: asyncio.Queue):
    """Pulls audio chunks from the queue and yields them to the AWS stream"""
    while True:
        try:
            chunk = await audio_queue.get()
            if chunk is None:
                break
            yield chunk
        except Exception as e:
            print(f"Error in audio stream generator: {e}")
            break


class MyTranscriptHandler(TranscriptResultStreamHandler):
    """Handles the transcript events from AWS and sends them to the client"""

    def __init__(self, transcript_result_stream, client_websocket: WebSocket,transcript_queue: asyncio.Queue):
        super().__init__(transcript_result_stream)
        self.client_websocket = client_websocket
        self.transcript_queue= transcript_queue

    async def handle_transcript_event(self, transcript_event: TranscriptEvent):
        results = transcript_event.transcript.results

        if results:
            for result in results:
                if result.alternatives:
                    alt = result.alternatives[0]
                    transcript_text = alt.transcript

                    if not result.is_partial:
                        await self.transcript_queue.put(transcript_text)
                        await self.client_websocket.send_json(
                            {"status": "FINAL_SEGMENT", "transcript": transcript_text}
                        )
                    else:
                        await self.client_websocket.send_json(
                            {"status": "PARTIAL_SEGMENT", "transcript": transcript_text}
                        )


from fastapi import WebSocket
from typing import Dict
import uuid

# Store active WebSocket sessions
latest_transcription_result=None
@app.websocket("/ws/transcribe-live")
async def websocket_transcribe_live(websocket: WebSocket):
    """Handles a live audio stream from the client for transcription"""
    await websocket.accept()
    

    print(f"INFO: transcription connection open")

    audio_queue = asyncio.Queue()
    transcript_queue = asyncio.Queue()
    transcribe_client = TranscribeStreamingClient(region=AWS_REGION)

    stream = await transcribe_client.start_stream_transcription(
        language_code="en-US",
        media_sample_rate_hz=16000,
        media_encoding="pcm",
    )

    handler = MyTranscriptHandler(stream.output_stream, websocket, transcript_queue)

    async def read_from_client():
        while True:
            try:
                data = await websocket.receive_bytes()
                await audio_queue.put(data)
            except WebSocketDisconnect:
                print(f"Session  Client disconnected.")
                await audio_queue.put(None)
                break
            except Exception as e:
                print(f"Session    Error reading from client: {e}")
                await audio_queue.put(None)
                break

    async def write_to_aws(aws_stream, audio_queue: asyncio.Queue):
            """
            Task 2: Takes audio from the queue and sends it to AWS.
            """
            # Use the generator you already wrote!
            stream_generator = audio_stream_generator(audio_queue)
            try:
                async for chunk in stream_generator:
                    # Send the audio chunk to AWS
                    await aws_stream.input_stream.send_audio_event(audio_chunk=chunk)
            except Exception as e:
                print(f"Error writing to AWS stream: {e}")
            finally:
                # Once the generator is done, tell AWS we are done sending audio
                await aws_stream.input_stream.end_stream()
                print("AWS audio stream ended.")
    try:    
        aggregator_task = asyncio.create_task(assemble_transcript(transcript_queue))
        # Task 3: Reads results from AWS and sends them to Angular
        aws_handler_task = asyncio.create_task(handler.handle_events())

        client_reader_task = asyncio.create_task(read_from_client())
        aws_writer_task = asyncio.create_task(write_to_aws(stream, audio_queue))

        # Wait for all three tasks to complete
        await asyncio.gather(client_reader_task, aws_handler_task, aws_writer_task)
        await transcript_queue.put(None)
        final_text = await aggregator_task
        pipe=api.APIPipeline()
        result=pipe.process_text(final_text)
        global latest_transcription_result
        latest_transcription_result = {
            "status": "SUCCESS",
            "type": "order_recognized",
            "data": result
        }
    except WebSocketDisconnect:
        print("WebSocket disconnected.")
    except Exception as e:
        print(f"Live transcription error: {e}")
        try:
            # Try to send a clean error message to the client
            await websocket.send_json({"status": "ERROR", "detail": str(e)})
        except:
            pass 
    finally:
        try:
            await websocket.close()
        except RuntimeError as e:
            if "already completed" in str(e) or "websocket.close" in str(e):
                pass  # Ignore "already closed" errors
            else:
                raise e  # Re-raise other runtime errors
        print("Live transcription websocket closed.")


@app.post("/api/get-transcription-result")
async def store_transcription_result(result: dict):
    """Endpoint for internal use to store the transcription result"""
    
    global latest_transcription_result
    print(latest_transcription_result,"posting")
    latest_transcription_result = result
    return {"message": "Result stored"}

@app.get("/api/get-transcription-result")
async def get_transcription_result():
    """Frontend calls this to get the latest transcription result"""
    
    global latest_transcription_result
    
    if latest_transcription_result is None:
        return {"status": "NO_DATA", "message": "No transcription result available"}
    
    return latest_transcription_result



# --- Run the Server ---
if __name__ == "__main__":
    print("Starting local backend server at http://localhost:8000")
    print(f"Using AWS Region: {AWS_REGION}")
    print("📢 Notification service initialized")
    print("⏰ Time simulation ready")
    uvicorn.run(app, host="0.0.0.0", port=8000)
