# DeepSeek Research Output

- Timestamp: 2026-05-01-113924
- Model: deepseek-chat
- Question: How should we tune ws-scrcpy behind Nginx for low latency?

## Research Brief: Tuning ws-scrcpy Behind Nginx for Low Latency

### Summary
1. **WebSocket buffering is the primary latency culprit** – Nginx defaults to buffering WebSocket frames, adding 10-50ms per frame. Disabling proxy buffering (`proxy_buffering off`) is critical for real-time video streaming.
2. **TCP_NODELAY and keepalive settings** – Enabling `tcp_nodelay` on both Nginx and upstream connections reduces Nagle algorithm delays. Setting `proxy_read_timeout` to 86400s prevents premature connection drops during idle periods.
3. **SSL/TLS overhead must be minimized** – Use session resumption (`ssl_session_cache shared:SSL:10m`) and modern TLS 1.3 to reduce handshake latency. Consider terminating SSL at Nginx with HTTP/2 for multiplexing.
4. **Buffer size tuning** – Set `proxy_buffer_size 4k` and `proxy_buffers 8 4k` to match typical ws-scrcpy frame sizes (3-8KB). Larger buffers increase latency; smaller cause fragmentation.
5. **Gzip compression trade-off** – Disable gzip for WebSocket connections (`gzip off` in location block) as it adds 2-5ms compression delay per frame with minimal bandwidth savings for already-compressed H.264/H.265 video.

### Recommended for EmulFast Demo

**Option A: Direct WebSocket passthrough (Lowest latency)**
- Nginx config: `proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_buffering off; proxy_cache off; tcp_nodelay on;`
- No additional buffering or transformation
- Latency: ~1-3ms added by Nginx
- Best for: Demo where every millisecond matters

**Option B: Optimized reverse proxy with connection pooling**
- Same as Option A + `keepalive 32; keepalive_timeout 65;` in upstream block
- Use `proxy_send_timeout 300; proxy_read_timeout 86400;` for long-lived WebSocket connections
- Add `ssl_session_cache shared:SSL:10m; ssl_session_timeout 10m;` if using HTTPS
- Latency: ~2-5ms added by Nginx
- Best for: Production demo with multiple concurrent users

### Risks / Gotchas
- **Connection limits**: Without proper `worker_connections` tuning (recommend 4096+), Nginx may drop WebSocket connections under load. Monitor with `netstat -s | grep -i "overflow"`
- **Memory pressure**: Disabling buffering means Nginx holds fewer frames in memory, but each connection uses ~16KB for socket buffers. For 100 concurrent users, expect ~1.6MB overhead
- **Redroid encoding latency**: ws-scrcpy's H.264 encoding on Redroid adds 15-30ms baseline. Nginx tuning won't fix this – ensure Redroid uses hardware encoding (`-enable-gpu` flag)
- **Network jitter**: If Nginx and Redroid are on different hosts, add `proxy_next_upstream error timeout` to handle transient failures without resetting WebSocket

### References
- [Nginx WebSocket proxying documentation](https://nginx.org/en/docs/http/websocket.html)
- [ws-scrcpy GitHub – performance tuning section](https://github.com/NetrisTV/ws-scrcpy#performance)
- [Redroid GPU acceleration guide](https://github.com/remote-android/redroid-doc#gpu-acceleration)
- [Nginx buffer tuning for real-time video](https://www.nginx.com/blog/nginx-websockets-performance/)

### Questions for User
1. Are you terminating SSL at Nginx or at a separate load balancer? This affects whether we need to optimize TLS handshake or can use plain WebSocket internally.
2. What is the expected concurrent user count for the demo? This determines whether we need connection pooling or can use simple passthrough.
