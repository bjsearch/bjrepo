# CCTV Relay (home network)

The website (deployed on Vercel) cannot reach a camera that lives on your
home network directly. This small stack runs **on a computer at home**
(e.g. a Raspberry Pi, NAS, or always-on PC) and does three things:

1. **ffmpeg** pulls the RTSP feed from your IP camera and re-encodes it to
   HLS (`stream.m3u8` + `.ts` segments), updated every ~2 seconds.
2. **nginx** serves those HLS files over plain HTTP on your local network.
3. **cloudflared** opens a free Cloudflare Tunnel so that local HTTP server
   is reachable from the internet over HTTPS, without opening any ports on
   your router.

The website then proxies `/api/cctv/*` requests (only for logged-in users)
to that tunnel URL, so the camera is never exposed publicly without
authentication.

## Setup

1. Find your camera's RTSP URL (check the camera/NVR settings or manual).
   It usually looks like:

   ```
   rtsp://username:password@192.168.0.50:554/stream1
   ```

2. Copy the env file and fill in your RTSP URL:

   ```bash
   cd cctv-relay
   cp .env.example .env
   # edit .env and set RTSP_URL
   ```

3. Start the stack:

   ```bash
   docker compose up -d
   ```

4. Get your public tunnel URL:

   ```bash
   docker compose logs cloudflared | grep trycloudflare.com
   ```

   This prints a URL like `https://random-words-1234.trycloudflare.com`.
   Verify it works by opening `<that-url>/stream.m3u8` in a browser — it
   should download a small playlist file.

5. In your Vercel project settings, add an environment variable:

   ```
   CCTV_STREAM_URL=https://random-words-1234.trycloudflare.com
   ```

   Redeploy the site. Logged-in users can now open the **CCTV** tab to
   watch the live stream (a few seconds of delay is expected).

## Notes

- The free `trycloudflare.com` URL changes every time the `cloudflared`
  container restarts. For a stable URL, set up a named Cloudflare Tunnel
  with your own domain (see [Cloudflare Tunnel docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)),
  and use `cloudflared tunnel run <name>` instead of the quick tunnel
  command in `docker-compose.yml`.
- If your camera doesn't support RTSP directly but has an ONVIF interface,
  most ONVIF cameras also expose an RTSP URL — check the camera's web UI
  under "Network" or "RTSP" settings.
- To test the RTSP feed itself before running the stack, you can use:

  ```bash
  ffplay rtsp://username:password@192.168.0.50:554/stream1
  ```
