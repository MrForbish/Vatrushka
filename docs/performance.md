# Performance baseline

Stage 8 introduces a reproducible renderer bundle profile. Run it after a desktop build:

```powershell
npm run perf:bundle
```

`npm run perf:check` only evaluates an existing `apps/desktop/out/renderer` build and is used by CI after `npm run build`.

## Release budgets

The JavaScript ceiling is 2.8 MB and remains a blocking regression gate.

| Asset | vNext measured baseline | Blocking budget |
|---|---:|---:|
| Renderer JavaScript, raw total | 2,465.7 KiB | 2,600,000 bytes |
| Largest JavaScript chunk | 2,212.2 KiB | 2,350,000 bytes |
| Renderer CSS, raw total | 170.9 KiB | 190,000 bytes |
| Local fonts, raw total | 431.8 KiB | 500,000 bytes |

The script also prints gzip sizes for comparison. Raw sizes are the blocking metric because Electron loads local assets from the packaged application rather than transferring them over HTTP with content encoding. Budgets intentionally leave a small margin for fixes while still detecting an accidental large dependency, font family or stylesheet.

The vNext baseline includes the canonical messaging client, notification center and complete lazy-loaded settings route. The route emits a separate JavaScript/CSS asset; the budget counts all packaged assets so a deferred feature cannot hide accidental growth. Future work must stay inside these measured ceilings or document another intentional baseline change.

## Runtime profile before a public release

Bundle size does not measure WebRTC quality. Use the two-machine Windows matrix from [testing.md](testing.md) and record these Chrome DevTools/Electron metrics:

1. cold start until the authentication or home screen becomes interactive;
2. renderer main-thread long tasks while opening a server with at least 1,000 messages;
3. renderer memory before joining voice, after ten minutes in voice and after leaving;
4. CPU while receiving 1080p screen share and while presenting it with system audio;
5. retained `MediaStreamTrack`, audio and video elements after stopping share and leaving the room.

The release is blocked by growing memory after two join/leave cycles, retained capture tracks, sustained renderer long tasks over 200 ms during message scrolling, or failure of the automated bundle budget.
