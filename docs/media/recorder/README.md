# Demo GIF recorder

Drives the running app in headless Chrome through the DevTools protocol, records the screen while a
scene plays (clicks, typing, a drawn cursor for hovers), and turns the frames into a small GIF with
one shared palette. The falling-snow animation is hidden while recording.

```bash
# backend on :8000 and frontend on :5173 first
pip install pillow
docs/media/recorder/record.sh storm      # writes docs/media/storm.gif
```

Scenes live in `scenes/`: `storm` (replay + future slider + hover readout), `pins` (hover cards +
locate button), `gemini` (asks the assistant a driving question), `route` (fastest vs. safer drive to
Dunkirk during the replay) and `readiness` (checklist and the ways to get missing items).

`gemini` needs Gemini quota and `route` needs openrouteservice quota; without them the app falls back
to its "busy" message and straight-line routes, which is not what the GIF should show.
