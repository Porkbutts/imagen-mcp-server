#!/usr/bin/env node
/**
 * MCP Server for Google Imagen API.
 *
 * This server provides tools to generate images using Google's Imagen models,
 * which produce high-quality, realistic images from text prompts.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios, { AxiosError } from "axios";
import * as fs from "fs";
import * as path from "path";

// Constants
const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// Available Imagen models
const IMAGEN_MODELS = {
  "imagen-4.0-generate-001": {
    name: "Imagen 4",
    description: "Latest Imagen model with best quality and prompt understanding",
    supportsImageSize: true,
  },
  "imagen-4.0-ultra-generate-001": {
    name: "Imagen 4 Ultra",
    description: "Higher quality variant with 2K resolution support",
    supportsImageSize: true,
  },
  "imagen-4.0-fast-generate-001": {
    name: "Imagen 4 Fast",
    description: "Faster generation with slightly reduced quality",
    supportsImageSize: true,
  },
  "imagen-3.0-generate-002": {
    name: "Imagen 3",
    description: "Previous generation model, stable and reliable",
    supportsImageSize: false,
  },
} as const;

type ImagenModel = keyof typeof IMAGEN_MODELS;

// Enums
enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

enum AspectRatio {
  SQUARE = "1:1",
  PORTRAIT_3_4 = "3:4",
  LANDSCAPE_4_3 = "4:3",
  PORTRAIT_9_16 = "9:16",
  LANDSCAPE_16_9 = "16:9",
}

enum ImageSize {
  STANDARD = "1K",
  ULTRA = "2K",
}

enum PersonGeneration {
  DONT_ALLOW = "dont_allow",
  ALLOW_ADULT = "allow_adult",
  ALLOW_ALL = "allow_all",
}

// Types
interface ImagenResponse {
  predictions?: Array<{
    bytesBase64Encoded?: string;
    mimeType?: string;
  }>;
}

interface GeneratedImage {
  index: number;
  mimeType: string;
  base64Data: string;
  savedPath?: string;
}

// Get API key from environment
function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY or GOOGLE_API_KEY environment variable is required"
    );
  }
  return apiKey;
}

// Shared API request function
async function makeImagenRequest(
  model: string,
  prompt: string,
  parameters: Record<string, unknown>
): Promise<ImagenResponse> {
  const apiKey = getApiKey();
  const url = `${API_BASE_URL}/models/${model}:predict`;

  try {
    const response = await axios.post<ImagenResponse>(
      url,
      {
        instances: [{ prompt }],
        parameters,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        timeout: 120000, // 2 minute timeout for image generation
      }
    );
    return response.data;
  } catch (error) {
    throw error;
  }
}

// Error handling
function handleApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: { message?: string } }>;
    if (axiosError.response) {
      const status = axiosError.response.status;
      const message = axiosError.response.data?.error?.message;

      switch (status) {
        case 400:
          return `Error: Invalid request. ${message || "Check your prompt and parameters."}`;
        case 401:
          return "Error: Invalid API key. Please check your GEMINI_API_KEY environment variable.";
        case 403:
          return `Error: Access denied. ${message || "You may not have access to this model or feature."}`;
        case 404:
          return "Error: Model not found. Please check the model name is correct.";
        case 429:
          return "Error: Rate limit exceeded. Please wait before making more requests.";
        case 500:
        case 502:
        case 503:
          return "Error: Google API service temporarily unavailable. Please try again later.";
        default:
          return `Error: API request failed with status ${status}. ${message || ""}`;
      }
    } else if (axiosError.code === "ECONNABORTED") {
      return "Error: Request timed out. Image generation can take up to 2 minutes. Please try again.";
    } else if (axiosError.code === "ENOTFOUND") {
      return "Error: Unable to reach Google API. Please check your internet connection.";
    }
  }
  return `Error: Unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`;
}

// Save base64 image to file
function saveBase64Image(
  base64Data: string,
  mimeType: string,
  outputPath: string
): string {
  const extension = mimeType.split("/")[1] || "png";
  let finalPath = outputPath;

  // Add extension if not present
  if (!path.extname(outputPath)) {
    finalPath = `${outputPath}.${extension}`;
  }

  // Ensure directory exists
  const dir = path.dirname(finalPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write file
  const buffer = Buffer.from(base64Data, "base64");
  fs.writeFileSync(finalPath, buffer);

  return finalPath;
}

// Create MCP server instance
const server = new McpServer({
  name: "imagen-mcp-server",
  version: "1.0.0",
});

// Zod schemas
const GenerateImageInputSchema = z
  .object({
    prompt: z
      .string()
      .min(1, "Prompt is required")
      .max(480, "Prompt must not exceed 480 tokens (approximately 480 words)")
      .describe(
        "Text description of the image to generate. For best results, be specific about subject, style, lighting, composition, and mood. Maximum 480 tokens."
      ),
    model: z
      .enum([
        "imagen-4.0-generate-001",
        "imagen-4.0-ultra-generate-001",
        "imagen-4.0-fast-generate-001",
        "imagen-3.0-generate-002",
      ])
      .default("imagen-4.0-generate-001")
      .describe("Imagen model to use for generation"),
    number_of_images: z
      .number()
      .int()
      .min(1)
      .max(4)
      .default(1)
      .describe("Number of images to generate (1-4)"),
    aspect_ratio: z
      .nativeEnum(AspectRatio)
      .default(AspectRatio.SQUARE)
      .describe(
        "Aspect ratio of generated images: '1:1' (square), '3:4', '4:3', '9:16', '16:9'"
      ),
    image_size: z
      .nativeEnum(ImageSize)
      .optional()
      .describe(
        "Image resolution: '1K' (standard) or '2K' (ultra). Only available for Imagen 4 models."
      ),
    person_generation: z
      .nativeEnum(PersonGeneration)
      .default(PersonGeneration.ALLOW_ADULT)
      .describe(
        "Controls generation of people: 'dont_allow', 'allow_adult', 'allow_all'"
      ),
    output_path: z
      .string()
      .min(1, "Output path is required")
      .describe(
        "File path to save the generated image(s). For multiple images, index will be appended (e.g., output_1.png, output_2.png)"
      ),
    response_format: z
      .nativeEnum(ResponseFormat)
      .default(ResponseFormat.MARKDOWN)
      .describe(
        "Output format: 'markdown' for human-readable or 'json' for machine-readable"
      ),
  })
  .strict();

type GenerateImageInput = z.infer<typeof GenerateImageInputSchema>;

const ListModelsInputSchema = z
  .object({
    response_format: z
      .nativeEnum(ResponseFormat)
      .default(ResponseFormat.MARKDOWN)
      .describe(
        "Output format: 'markdown' for human-readable or 'json' for machine-readable"
      ),
  })
  .strict();

type ListModelsInput = z.infer<typeof ListModelsInputSchema>;

// Register tools
server.registerTool(
  "imagen_generate_image",
  {
    title: "Generate Image with Imagen",
    description: `Generate images from text prompts using Google's Imagen models.

This tool creates high-quality, photorealistic images based on text descriptions. All generated images include SynthID watermarks for AI content identification.

Args:
  - prompt (string): Text description of the image to generate. Maximum 480 tokens. For best results, describe:
    - Subject matter and composition
    - Art style (photorealistic, illustration, painting, etc.)
    - Lighting and atmosphere
    - Colors and mood
  - model (string): Imagen model to use (default: 'imagen-4.0-generate-001')
    - 'imagen-4.0-generate-001': Best quality and prompt understanding
    - 'imagen-4.0-ultra-generate-001': Higher quality with 2K support
    - 'imagen-4.0-fast-generate-001': Faster generation
    - 'imagen-3.0-generate-002': Previous generation, stable
  - number_of_images (number): Number of images to generate, 1-4 (default: 1)
  - aspect_ratio (string): Image aspect ratio (default: '1:1')
    - '1:1': Square
    - '3:4': Portrait
    - '4:3': Landscape
    - '9:16': Tall portrait (mobile)
    - '16:9': Wide landscape
  - image_size (string, optional): '1K' or '2K' (Imagen 4 only)
  - person_generation (string): Controls people in images (default: 'allow_adult')
  - output_path (string, required): File path to save image(s)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  File paths of saved images.

  JSON schema:
  {
    "model": string,
    "prompt": string,
    "images": [
      {
        "index": number,
        "mimeType": string,
        "savedPath": string
      }
    ],
    "count": number
  }

Examples:
  - "A serene mountain lake at sunset with purple and orange sky reflections"
  - "Professional product photo of a smartphone on white background, studio lighting"
  - "Cute cartoon robot holding a coffee cup, digital art style, vibrant colors"

Notes:
  - English-language prompts only
  - Images include SynthID watermarks
  - Generation may take 30-60 seconds`,
    inputSchema: GenerateImageInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (params: GenerateImageInput) => {
    try {
      // Build parameters
      const apiParams: Record<string, unknown> = {
        sampleCount: params.number_of_images,
        aspectRatio: params.aspect_ratio,
        personGeneration: params.person_generation,
      };

      // Add imageSize only for Imagen 4 models
      if (
        params.image_size &&
        IMAGEN_MODELS[params.model as ImagenModel]?.supportsImageSize
      ) {
        apiParams.imageSize = params.image_size;
      }

      // Make API request
      const response = await makeImagenRequest(
        params.model,
        params.prompt,
        apiParams
      );

      if (!response.predictions || response.predictions.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: No images were generated. The prompt may have been blocked by safety filters. Try rephrasing your prompt.",
            },
          ],
        };
      }

      // Process and save generated images
      const images: GeneratedImage[] = [];
      for (let i = 0; i < response.predictions.length; i++) {
        const prediction = response.predictions[i];
        if (prediction.bytesBase64Encoded) {
          const mimeType = prediction.mimeType || "image/png";
          const outputPath =
            response.predictions.length > 1
              ? params.output_path.replace(/(\.[^.]+)?$/, `_${i + 1}$1`)
              : params.output_path;

          const savedPath = saveBase64Image(
            prediction.bytesBase64Encoded,
            mimeType,
            outputPath
          );

          images.push({
            index: i + 1,
            mimeType,
            base64Data: "", // Not stored in response
            savedPath,
          });
        }
      }

      // Build output (no base64 data)
      const output = {
        model: params.model,
        prompt: params.prompt,
        images: images.map((img) => ({
          index: img.index,
          mimeType: img.mimeType,
          savedPath: img.savedPath,
        })),
        count: images.length,
      };

      // Format response
      let textContent: string;
      if (params.response_format === ResponseFormat.MARKDOWN) {
        const lines = [
          `# Image Generation Complete`,
          "",
          `**Model**: ${params.model}`,
          `**Prompt**: ${params.prompt}`,
          `**Images Generated**: ${images.length}`,
          "",
        ];

        for (const img of images) {
          lines.push(`## Image ${img.index}`);
          lines.push(`- **Format**: ${img.mimeType}`);
          lines.push(`- **Saved to**: ${img.savedPath}`);
          lines.push("");
        }

        textContent = lines.join("\n");
      } else {
        textContent = JSON.stringify(output, null, 2);
      }

      return {
        content: [{ type: "text" as const, text: textContent }],
        structuredContent: output,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: handleApiError(error),
          },
        ],
      };
    }
  }
);

server.registerTool(
  "imagen_list_models",
  {
    title: "List Imagen Models",
    description: `List available Google Imagen models for image generation.

Returns information about each supported model including capabilities and recommended use cases.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of available Imagen models with descriptions and capabilities.

  JSON schema:
  {
    "models": [
      {
        "id": string,
        "name": string,
        "description": string,
        "supportsImageSize": boolean
      }
    ],
    "count": number
  }`,
    inputSchema: ListModelsInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params: ListModelsInput) => {
    const models = Object.entries(IMAGEN_MODELS).map(([id, info]) => ({
      id,
      name: info.name,
      description: info.description,
      supportsImageSize: info.supportsImageSize,
    }));

    const output = {
      models,
      count: models.length,
    };

    let textContent: string;
    if (params.response_format === ResponseFormat.MARKDOWN) {
      const lines = [
        "# Available Imagen Models",
        "",
        `Found ${models.length} models:`,
        "",
      ];

      for (const model of models) {
        lines.push(`## ${model.name}`);
        lines.push(`- **ID**: \`${model.id}\``);
        lines.push(`- **Description**: ${model.description}`);
        lines.push(
          `- **2K Resolution**: ${model.supportsImageSize ? "Yes" : "No"}`
        );
        lines.push("");
      }

      textContent = lines.join("\n");
    } else {
      textContent = JSON.stringify(output, null, 2);
    }

    return {
      content: [{ type: "text" as const, text: textContent }],
      structuredContent: output,
    };
  }
);

// Main function
async function main(): Promise<void> {
  try {
    getApiKey();
  } catch (error) {
    console.error(
      "ERROR: GEMINI_API_KEY or GOOGLE_API_KEY environment variable is required"
    );
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Imagen MCP server running via stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
