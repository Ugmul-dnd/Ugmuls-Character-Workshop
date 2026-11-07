# Local portrait retrieval — approved and deployed

User approved this Worker update on November 6, 2026. Uploaded the tested bundle to the existing Worker, preserving existing settings. Active upload version: `60090e3eb1fd4a56995edb57cfacb383`.

Live verification: Kal's portrait route returned HTTP 200, image/jpeg, 116,633 bytes, and CORS `*`; normal character retrieval returned HTTP 200 JSON; portrait OPTIONS preflight returned HTTP 204 and CORS `*`. No image content was printed or saved during verification. Foundry's actual file upload still needs in-game verification on the next import. Earlier approval-pending notes below describe the pre-deployment stage.

Update the existing `ugmuls-ddb-public-proxy` Worker with the validated bundle, retaining its current bindings, observability settings, compatibility settings, and workers.dev routing. Add `GET /v1/characters/{id}/portrait` on the existing hostname. No new domains, Pages projects, storage resources, or secrets are required.

The route obtains public character JSON through the existing character handler and its limits. It derives the avatar URL from that response; callers cannot provide an arbitrary image URL. Only HTTPS D&D Beyond avatar hosts/paths are accepted. Redirects are rejected, credentials omitted, image retrieval is additionally upstream-rate-limited, responses are bounded to 5 MiB and 15 seconds, and only JPEG/PNG/WebP signatures are served with CORS. The Worker does not persist artwork or image logs.

The Foundry module downloads the image and uploads it using FilePicker to `worlds/<world-id>/token-images/<actor-id>-portrait.<extension>`, then updates the newly built actor's portrait. Users require file upload permission. The original hosted image remains as a logged fallback if retrieval or upload fails. No Tokenizer dependency is introduced. Source review: Tokenizer uses an image proxy plus Foundry FilePicker uploads; no Tokenizer code was copied.

Local verification: 132 handler/importer/portrait checks passed, and the updated bundle passed a separate native workerd cache/rate-binding runtime test. Production upload was rejected by automatic approval review because this exact Worker change had not received explicit deployment approval. No production update occurred. The current live portrait route returned HTTP 400, as expected before deployment.

After approval: upload the tested bundle with existing settings preserved, test Kal's public portrait route for image content and CORS, recheck normal character retrieval, then have the user verify that a new Foundry import saves its portrait locally. No live actor or file uploads were performed during testing.
