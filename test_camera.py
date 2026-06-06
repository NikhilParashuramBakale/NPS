import httpx
import asyncio

async def test_camera():
    print("Testing IP camera connection...")
    print("=" * 60)
    
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            print('\n1. Testing HEAD request...')
            head = await client.head('http://172.17.4.55:8080/')
            print(f'   ✓ HEAD Status: {head.status_code}')
            print(f'   Content-Type: {head.headers.get("content-type", "Not set")}')
    except Exception as e:
        print(f'   ✗ HEAD failed: {type(e).__name__}: {e}')
    
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            print('\n2. Testing GET request (first chunk)...')
            async with client.stream('GET', 'http://172.17.4.55:8080/') as response:
                print(f'   ✓ GET Status: {response.status_code}')
                print(f'   Content-Type: {response.headers.get("content-type", "Not set")}')
                async for chunk in response.aiter_bytes():
                    print(f'   ✓ Received chunk: {len(chunk)} bytes')
                    if len(chunk) > 0:
                        print(f'   First 50 bytes: {chunk[:50]}')
                    break
    except Exception as e:
        print(f'   ✗ GET failed: {type(e).__name__}: {e}')

asyncio.run(test_camera())
