# Imagen MCP Server

An MCP (Model Context Protocol) server for Google's Imagen image generation API. This server allows AI assistants to generate high-quality images from text prompts using Google's Imagen models.

## Features

- **Text-to-Image Generation**: Create photorealistic images from descriptive text prompts
- **Multiple Models**: Support for Imagen 3 and Imagen 4 variants including Ultra and Fast
- **Flexible Output**: Multiple aspect ratios and resolution options
- **File Saving**: Images are saved directly to disk (required)
- **Safety Controls**: Configurable person generation settings

## Prerequisites

- Node.js 18 or higher
- A Google AI API key (get one at https://aistudio.google.com/apikey)

## Installation

```bash
npm install
npm run build
```

## Configuration

Set your Gemini API key as an environment variable:

```bash
export GEMINI_API_KEY="your-api-key-here"
```

## Usage with Claude Code

```bash
claude mcp add-json imagen '{
  "command": "node",
  "args": ["/path/to/imagen-mcp-server/dist/index.js"],
  "env": {
    "GEMINI_API_KEY": "your-api-key-here"
  }
}'
```

## Available Tools

### `imagen_generate_image`

Generate images from a text prompt.

**Parameters:**
- `prompt` (required): Text description of the image to generate (max 480 tokens)
- `model` (optional): Imagen model to use (default: `imagen-4.0-generate-001`)
- `number_of_images` (optional): Number of images to generate, 1-4 (default: 1)
- `aspect_ratio` (optional): `1:1`, `3:4`, `4:3`, `9:16`, or `16:9` (default: `1:1`)
- `image_size` (optional): `1K` or `2K` (Imagen 4 only)
- `person_generation` (optional): `dont_allow`, `allow_adult`, or `allow_all` (default: `allow_adult`)
- `output_path` (required): File path to save the generated image(s)
- `response_format` (optional): `markdown` or `json` (default: `markdown`)

**Example:**
```
Generate a serene mountain lake at sunset with purple and orange sky reflections
```

### `imagen_list_models`

List available Imagen models and their capabilities.

**Parameters:**
- `response_format` (optional): `markdown` or `json` (default: `markdown`)

## Prompting Tips

For best results with Imagen, describe:
- **Subject**: What is in the image
- **Style**: Photorealistic, illustration, oil painting, digital art, etc.
- **Composition**: Close-up, wide shot, centered, rule of thirds
- **Lighting**: Natural light, studio lighting, golden hour, dramatic shadows
- **Mood**: Calm, energetic, mysterious, cheerful

Example: "Professional product photo of a sleek smartphone on a white marble surface, soft studio lighting, minimal composition, high-end advertising style."

## Models

| Model | Best For | Resolution |
|-------|----------|------------|
| imagen-4.0-generate-001 | Best quality and prompt understanding | 1K, 2K |
| imagen-4.0-ultra-generate-001 | Highest quality with 2K support | 1K, 2K |
| imagen-4.0-fast-generate-001 | Faster generation | 1K, 2K |
| imagen-3.0-generate-002 | Stable, previous generation | 1K |

## Aspect Ratios

| Ratio | Use Case |
|-------|----------|
| 1:1 | Social media posts, profile pictures |
| 3:4 | Portrait photos, posters |
| 4:3 | Landscape, presentations |
| 9:16 | Mobile wallpapers, stories |
| 16:9 | Desktop wallpapers, headers |

## Notes

- English-language prompts only
- All generated images include SynthID watermarks for AI content identification
- Image generation typically takes 30-60 seconds
- Maximum prompt length is 480 tokens

## Development

```bash
# Watch mode with auto-reload
npm run dev

# Build
npm run build

# Run
npm start
```

## License

MIT
