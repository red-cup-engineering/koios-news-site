# Receive accessible article audio and video

## Reader requirement and source owners

The Leader's October 26 content-quality direction requires audio and video to
become usable parts of the same accepted report. This receiving slice preserves
[Koios.News issue 37](https://github.com/red-cup-engineering/koios.news/issues/37)'s
source-bound journalism, independent admission and public receiving obligations,
and [Content Engineering issue 20](https://github.com/red-cup-engineering/computer-content-engineering-services-section/issues/20)'s
existing media-engine ownership and capability-preservation boundary. The existing
article parser, publication ledger, asset receiver, renderer and sealed manifest
own this publishing slice. Computer Media owns production, encoding and media
inspection; the newsroom owns source reporting, transcript accuracy, licensing
and independent editorial acceptance. This website does not synthesize speech,
buy footage, transcode files, infer a license, or grant publication authority.

The accepted manuscript must select the exact bytes before publication. Its
existing source digest binds the media metadata, transcript and asset SHA-256s.
With `requirePublishedLedger`, the unchanged existing ledger admission applies to
this entire manuscript. No sidecar directory scan, unadmitted metadata override,
or media-ready flag can add an asset to a report.

## Supported source contract

The optional `media` frontmatter field is a **single-line JSON array** using
schema.org [AudioObject](https://schema.org/AudioObject),
[VideoObject](https://schema.org/VideoObject) and caption MediaObject vocabulary.
Each selected audio/video object requires:

- `@type`: `AudioObject` or `VideoObject`;
- `name`, `contentUrl`, `encodingFormat`, lowercase 64-digit `sha256`;
- `transcript`: the complete, independently accepted plain-text alternative;
- `inLanguage`: a BCP 47 language tag;
- `creditText` and an absolute credential-free HTTPS `license` URL.

An optional `description` explains the recording. A video also requires a
`caption` object with `@type: MediaObject`, `encodingFormat: text/vtt`, `name`,
`inLanguage`, `contentUrl` and its own exact `sha256`. Audio may carry the same
caption resource. The media license is distinct from the article's license.
Unsupported fields refuse instead of suggesting they have been received.

Supported source declarations and extensions are `audio/mpeg` (`.mp3`),
`audio/mp4` (`.m4a`), `audio/ogg` (`.ogg`, `.opus`), `audio/wav` (`.wav`),
`video/mp4` (`.mp4`), and `video/webm` (`.webm`). Caption files use `.vtt`.
All assets must already exist at same-origin `/assets/` URLs beneath the admitted
content root. The original image boundary's traversal, credentials, remote URL,
query, fragment, encoded-path and escaping-symlink refusals remain in force.

The receiver measures bytes and verifies each selected SHA-256 before rendering.
It rejects an empty asset, a MIME/extension disagreement, or a contradictory
container signature. Signature recognition is a bounded mismatch check, **not a
codec decoder or a guarantee of playback**. Actual encoding, full decoding,
stream type, transcript/recording correspondence and editorial usefulness remain
the producing Computer Media and independent editorial receivers' obligations.
Unverified durations, dimensions and upload dates are omitted from public schema.
The existing [Cloudflare Pages asset limit](https://developers.cloudflare.com/pages/platform/limits/)
is 25 MiB per file; larger masters require their media owner's separate serving
path and cannot silently be copied into this static publication.

## Caption and accessibility receiving

The first supported [WebVTT](https://www.w3.org/TR/webvtt1/) profile is UTF-8 plain
text: a `WEBVTT` header, nonempty timed cues, optional unique cue identifiers and `NOTE`
comments. Starts must be nondecreasing and each end must follow its start.
Overlapping cues remain permitted. Unsupported styling, regions, cue settings
and cue markup refuse; they are not silently stripped. The validator establishes
this profile's syntax, not spoken-word accuracy or complete temporal coverage.

Every audio/video uses the [HTML media elements](https://html.spec.whatwg.org/multipage/media.html)
with native keyboard-accessible controls, `preload=none`
and no autoplay. The visible report and feed article include a direct download,
media credit and license, and the complete transcript as normal visible HTML.
Video includes its received caption track with language, label and default
selection. Download/transcript links remain useful when a feed reader strips
players. Transcript text is escaped; it cannot introduce executable markup.

These receiving choices implement the accessible alternatives described in W3C
[SC 1.2.1](https://www.w3.org/WAI/WCAG22/Understanding/audio-only-and-video-only-prerecorded.html)
and [SC 1.2.2](https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html).
The website cannot certify either criterion's semantic accuracy from syntax.

## Same received bytes across every public projection

The build reads selected bytes once and carries those same buffers into its
existing manifest. It never rewrites the accepted manuscript, ledger, recording
or captions, and it never publishes an unselected neighboring file. Conflicting
bytes at one public output path refuse before output. Every claimed recording
and caption has measured `contentSize`, its admitted SHA-256, an absolute
`contentUrl`, and its selected MIME header in the publication's `_headers`.
The [Pages header rules](https://developers.cloudflare.com/pages/configuration/headers/)
use one `/assets/*.<extension>` pattern per received extension, so growing the
archive does not exhaust the platform's 100-rule limit. A header pattern does
not select, copy or publish any additional asset.

NewsArticle `audio` and `video` contain the same schema.org media records, linked
to that article. Existing upstream RSS/Atom/JSON Feed serializers receive the
same accessible article through their supported `contentHtml` interface. **This
slice does not emit RSS enclosures, Atom enclosure links or JSON Feed
attachments:** the pinned serialized-content owner does not expose that contract.
Extending those standards belongs at that existing owner, with native consumer
receiving, rather than a competing serializer here.

## Acceptance and preserved boundaries

The actual build entrance must receive real generated test audio/video and timed
captions, seal their exact bytes, and expose corresponding controls, transcript,
credits, license, MIME headers, NewsArticle nodes and all three feed bodies.
Independent ffprobe inspection can verify the **fixture's** media streams; it is
not an undeclared production dependency. Refusal cases include changed bytes,
missing transcript, missing or malformed video captions, invalid UTF-8,
unsupported encodings, wrong container signatures, private/escaping URLs and
unadmitted manuscripts. The unchanged no-media article remains a working control.

Package publication, production installation, independently accepted real
recordings, correction propagation and live reader playback are separate
receiving stages. A source test does not establish any of those effects.
