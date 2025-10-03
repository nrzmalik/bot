from flask import Flask, request, jsonify, render_template, Response, stream_with_context
from flask_cors import CORS
from openai import OpenAI
import os
import time
import json
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
ASSISTANT_ID = os.getenv('ASSISTANT_ID')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/create-thread', methods=['POST'])
def create_thread():
    """Create a new conversation thread"""
    try:
        thread = client.beta.threads.create()
        return jsonify({
            'success': True,
            'thread_id': thread.id
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/send-message-stream', methods=['POST'])
def send_message_stream():
    """Send a message and stream assistant response"""
    try:
        data = request.json
        thread_id = data.get('thread_id')
        message = data.get('message')
        
        if not thread_id or not message:
            return jsonify({
                'success': False,
                'error': 'Missing thread_id or message'
            }), 400
        
        def generate():
            try:
                # Add user message to thread
                client.beta.threads.messages.create(
                    thread_id=thread_id,
                    role="user",
                    content=message
                )
                
                # Stream the assistant response
                with client.beta.threads.runs.stream(
                    thread_id=thread_id,
                    assistant_id=ASSISTANT_ID
                ) as stream:
                    for event in stream:
                        if event.event == 'thread.message.delta':
                            for content in event.data.delta.content:
                                if hasattr(content, 'text') and hasattr(content.text, 'value'):
                                    chunk = content.text.value
                                    yield f"data: {json.dumps({'chunk': chunk})}\n\n"
                        elif event.event == 'thread.run.completed':
                            yield f"data: {json.dumps({'done': True})}\n\n"
                
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        return Response(
            stream_with_context(generate()),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no'
            }
        )
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/send-message', methods=['POST'])
def send_message():
    """Send a message and get assistant response"""
    try:
        data = request.json
        thread_id = data.get('thread_id')
        message = data.get('message')
        
        if not thread_id or not message:
            return jsonify({
                'success': False,
                'error': 'Missing thread_id or message'
            }), 400
        
        # Add user message to thread
        client.beta.threads.messages.create(
            thread_id=thread_id,
            role="user",
            content=message
        )
        
        # Run the assistant
        run = client.beta.threads.runs.create(
            thread_id=thread_id,
            assistant_id=ASSISTANT_ID
        )
        
        # Wait for completion with faster polling
        while run.status in ['queued', 'in_progress', 'cancelling']:
            time.sleep(0.1)  # Reduced from 0.5 to 0.1 seconds for faster response
            run = client.beta.threads.runs.retrieve(
                thread_id=thread_id,
                run_id=run.id
            )
        
        if run.status == 'completed':
            # Get messages
            messages = client.beta.threads.messages.list(
                thread_id=thread_id,
                order='desc',
                limit=1
            )
            
            assistant_message = messages.data[0].content[0].text.value
            
            return jsonify({
                'success': True,
                'response': assistant_message
            })
        else:
            return jsonify({
                'success': False,
                'error': f'Run failed with status: {run.status}'
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)

