import os
import boto3  # Used by the streaming library for credentials
import uvicorn
import asyncio  # Used heavily for streaming
import httpx  # For making HTTP requests to Dutch Bros API
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid
from dotenv import load_dotenv

# Import the AWS Transcribe Streaming SDK from the 'amazon-transcribe' package
from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.handlers import TranscriptResultStreamHandler
from amazon_transcribe.model import TranscriptEvent

# --- Configuration ---
# Load environment variables from .env file
load_dotenv()

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION")

# Dutch Bros POS API Configuration
DUTCH_BROS_API_BASE_URL = os.getenv("DUTCH_BROS_API_BASE_URL", "https://pos-api.example.com/v1")
DUTCH_BROS_API_KEY = os.getenv("DUTCH_BROS_API_KEY")

# Basic validation
if not all([AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION]):
    print("--------------------------------------------------")
    print("FATAL ERROR: Missing AWS configuration in .env file.")
    print("Please make sure your backend/.env file is correct.")
    print("--------------------------------------------------")
    # In a real app, you'd exit here
    # exit(1)

if not DUTCH_BROS_API_KEY:
    print("--------------------------------------------------")
    print("WARNING: Missing DUTCH_BROS_API_KEY in .env file.")
    print("Order submission to backend API will not work.")
    print("--------------------------------------------------")

# --- FastAPI App ---
app = FastAPI()

# --- CORS Middleware ---
# This allows your Angular app (running on localhost:4200)
# to connect to this backend (running on localhost:8000)
origins = [
    "http://localhost:4200",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)


# --- Order Models ---
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


# --- Order Endpoint ---
@app.post("/submit-order", response_model=OrderResponse)
async def submit_order(order: SubmitOrderRequest):
    """
    Submit a new order to the Dutch Bros POS system.
    
    This endpoint accepts customer name and order items,
    forwards them to the Dutch Bros backend API, and returns confirmation.
    """
    try:
        # Prepare order data in the format expected by Dutch Bros API
        # Following the structure from python.py example
        order_items = []
        for item in order.items:
            # Build modifiers dictionary from child_items
            modifiers = {}
            for mod in item.child_items:
                # Use modifier group as key and modifier name as value
                modifiers[mod['modifier_group']] = mod['name']
            
            order_items.append({
                "name": item.name,
                "category": item.category,
                "size": item.size,
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
        
        # Log the order locally
        print(f"\n{'='*60}")
        print(f"SUBMITTING ORDER TO DUTCH BROS API")
        print(f"{'='*60}")
        print(f"Customer: {order.customer_name}")
        print(f"Items: {len(order.items)}")
        
        # Log the complete request body
        print(f"\nRequest Body:")
        import json
        print(json.dumps(api_payload, indent=2))
        
        # Make API call to Dutch Bros backend
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
            # API call failed
            error_detail = response.json() if response.text else {"error": "Unknown error"}
            error_message = error_detail.get('error', {}).get('message', response.text)
            print(f"✗ API Error ({response.status_code}): {error_message}")
            print(f"{'='*60}\n")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Dutch Bros API error: {error_message}"
            )
        
    except httpx.RequestError as e:
        print(f"✗ Network error connecting to Dutch Bros API: {e}")
        print(f"{'='*60}\n")
        raise HTTPException(
            status_code=503,
            detail=f"Failed to connect to Dutch Bros API: {str(e)}"
        )
    except Exception as e:
        print(f"✗ Error processing order: {e}")
        print(f"{'='*60}\n")
        raise HTTPException(status_code=500, detail=f"Failed to process order: {str(e)}")


# --- WebSocket Audio Stream ---
# This async generator will read from an asyncio.Queue
# and feed audio chunks into the AWS Transcribe stream.
# This queue acts as a buffer between your Angular app and AWS.
async def audio_stream_generator(audio_queue: asyncio.Queue):
    """
    Pulls audio chunks from the queue and yields them to the AWS stream.
    """
    while True:
        try:
            # Get a chunk of audio from the queue
            # (put there by the client WebSocket)
            chunk = await audio_queue.get()
            if chunk is None:
                break  # Signal to end the stream
            yield chunk
        except Exception as e:
            print(f"Error in audio stream generator: {e}")
            break


# --- Custom Transcript Handler ---
# This class will handle the transcript events coming back from AWS
# and send them over our client-facing WebSocket (to Angular).
class MyTranscriptHandler(TranscriptResultStreamHandler):
    """
    Handles the transcript events from AWS and sends them to the client.
    """

    def __init__(self, transcript_result_stream, client_websocket: WebSocket):
        super().__init__(transcript_result_stream)
        self.client_websocket = client_websocket

    async def handle_transcript_event(self, transcript_event: TranscriptEvent):
        # This is called every time AWS sends us a new transcript event
        results = transcript_event.transcript.results

        # !!! FIX 1: Loop through ALL results in the event !!!
        # This fixes the "all at once" bug.
        if results:
            for result in results:
                if result.alternatives:  # Make sure there are alternatives
                    alt = result.alternatives[0]
                    transcript_text = alt.transcript

                    if not result.is_partial:
                        # We have a "final" segment
                        await self.client_websocket.send_json(
                            {"status": "FINAL_SEGMENT", "transcript": transcript_text}
                        )
                    else:
                        # We have a "partial" (interim) segment
                        await self.client_websocket.send_json(
                            {"status": "PARTIAL_SEGMENT", "transcript": transcript_text}
                        )


# --- Live Transcription WebSocket Endpoint ---
@app.websocket("/ws/transcribe-live")
async def websocket_transcribe_live(websocket: WebSocket):
    """
    Handles a live audio stream from the client for transcription.
    1. Receives audio chunks (raw PCM) from the client.
    2. Forwards them to AWS Transcribe Streaming.
    3. Receives transcript segments from AWS.
    4. Forwards them back to the client.
    """
    await websocket.accept()
    print("INFO:     connection open")

    # This queue will act as a buffer between the client and AWS
    audio_queue = asyncio.Queue()

    try:
        # 1. Configure the AWS Transcribe Streaming Client
        #    (FIX: Use 'region', not 'region_name')
        transcribe_client = TranscribeStreamingClient(region=AWS_REGION)

        # 2. Start the transcription stream
        #    (FIX: Do NOT pass 'input_event_stream' here)
        stream = await transcribe_client.start_stream_transcription(
            language_code="en-US",
            # CRITICAL: The audio from Angular MUST be 16000Hz
            media_sample_rate_hz=16000,
            # CRITICAL: The audio from Angular MUST be raw PCM
            media_encoding="pcm",
        )

        # 3. Instantiate our custom handler to process results
        handler = MyTranscriptHandler(stream.output_stream, websocket)

        # 4. Run three tasks at the same time:
        #    - Task 1: read_from_client: Reads audio from Angular and puts it in the queue
        #    - Task 2: write_to_aws: Reads from queue and sends to AWS
        #    - Task 3: aws_handler_task: Reads results from AWS (via the handler) and sends to Angular

        async def read_from_client():
            """
            Task 1: Reads audio bytes from the client WebSocket and puts them in the queue.
            """
            while True:
                try:
                    # Get raw audio data from the client
                    data = await websocket.receive_bytes()
                    await audio_queue.put(data)
                except WebSocketDisconnect:
                    print("Client disconnected.")
                    await audio_queue.put(None)  # Signal end to generator
                    break
                except Exception as e:
                    print(f"Error reading from client: {e}")
                    await audio_queue.put(None)  # Signal end
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

        # Task 3: Reads results from AWS and sends them to Angular
        aws_handler_task = asyncio.create_task(handler.handle_events())

        # Start tasks 1 and 2
        client_reader_task = asyncio.create_task(read_from_client())
        aws_writer_task = asyncio.create_task(write_to_aws(stream, audio_queue))

        # Wait for all three tasks to complete
        await asyncio.gather(client_reader_task, aws_handler_task, aws_writer_task)

    except WebSocketDisconnect:
        print("WebSocket disconnected.")
    except Exception as e:
        print(f"Live transcription error: {e}")
        try:
            # Try to send a clean error message to the client
            await websocket.send_json({"status": "ERROR", "detail": str(e)})
        except:
            pass  # Client might be gone
    finally:
        # !!! FIX 2: Catch the "already closed" error !!!
        try:
            await websocket.close()
        except RuntimeError as e:
            if "already completed" in str(e) or "websocket.close" in str(e):
                pass  # Ignore "already closed" errors
            else:
                raise e  # Re-raise other runtime errors
        print("Live transcription websocket closed.")


# --- Run the Server ---
if __name__ == "__main__":
    print("Starting local backend server at http://localhost:8000")
    print(f"Using AWS Region: {AWS_REGION}")
    uvicorn.run(app, host="0.0.0.0", port=8000)