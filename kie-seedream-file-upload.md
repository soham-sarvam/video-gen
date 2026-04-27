# Bytedance Seedance 2.0

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ""
  description: ""
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Bytedance Seedance 2.0
      deprecated: false
      description: >
        ## Query Task Status


        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:


        <Card title="Get Task Details" icon="lucide-search"
        href="/market/common/get-task-detail">
          Learn how to query task status and retrieve generation results
        </Card>


        ::: tip[]

        In production environments, it is recommended to use the callBackUrl
        parameter to receive automatic notifications upon completion, rather
        than polling the status API.

        :::


        > **Note**

        >

        > *   **Image-to-Video (First Frame)**, **Image-to-Video (First & Last
        Frames)**, and **Multimodal Reference-to-Video** (including reference
        images, videos, and audio) are three mutually exclusive scenarios and
        **cannot be used simultaneously**.

        > *   Multimodal Reference-to-Video can indirectly achieve a "First/Last
        Frame + Multimodal Reference" effect by specifying reference images as
        the first or last frame via prompts. If you need to strictly guarantee
        that the first and last frames are identical to the specified images,
        **prioritize using Image-to-Video (First & Last Frames)**




        ## Key Features


        <CardGroup cols={2}>
          <Card title="Text-to-Video" icon="lucide-wand-sparkles">
            Generate videos directly from text descriptions without input images
          </Card>
          <Card title="Image-to-Video" icon="lucide-images">
            Animate static images with 0-2 input images support
          </Card>
          <Card title="Dynamic Camera" icon="lucide-camera">
            Advanced camera movement with optional lens locking for stable shots
          </Card>
          <Card title="Audio Generation" icon="lucide-volume-2">
            Optional audio generation for enhanced video content
          </Card>
        </CardGroup>


        ## Related Resources


        <CardGroup cols={2}>
          <Card title="Market Overview" icon="lucide-store" href="/market/quickstart">
            Explore all available models
          </Card>
          <Card title="Common API" icon="lucide-cog" href="/common-api/get-account-credits">
            Check credits and account usage
          </Card>
        </CardGroup>
      operationId: bytedance-seedance-2
      tags:
        - docs/en/Market/Video Models/Bytedance
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `bytedance/seedance-2` for this endpoint
                  enum:
                    - bytedance/seedance-2
                  default: bytedance/seedance-2
                  x-apidog-enum:
                    - value: bytedance/seedance-2
                      name: ""
                      description: ""
                  examples:
                    - bytedance/seedance-2
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.


                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the generation task
                  properties:
                    prompt:
                      type: string
                      description: >-
                        The text prompt used to generate the video. Required
                        field. (Min length: 3, Max length: 20000 characters)
                      minLength: 3
                      maxLength: 20000
                      examples:
                        - >-
                          A serene beach at sunset with waves gently crashing on
                          the shore, palm trees swaying in the breeze, and
                          seagulls flying across the orange sky
                    first_frame_url:
                      type: string
                      description: |-
                        First frame image url or asset://{assetId} 
                        (for example: asset://asset-20260404242101-76djj)
                    last_frame_url:
                      type: string
                      description: |-
                        End frame image url or asset://{assetId} 
                        (for example: asset://asset-20260404242101-76djj)
                    reference_image_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                      description: >-
                        Enter a list of image URLs or asset://{assetId} (for
                        example: asset://asset-20260404242101-76djj).

                        Single image requirements:

                        Format: jpeg, png, webp, bmp, tiff, gif.

                        Aspect ratio (width/height): (0.4, 2.5)

                        Width and height (px): (300, 6000)

                        Size: Single image less than 30 MB.

                        Maximum number of files: The sum of the number of frames
                        at the beginning and end must not exceed 9..
                      maxItems: 9
                      examples:
                        - - >-
                            https://file.aiquickdraw.com/custom-page/akr/section-images/example1.png
                    "reference_video_urls ":
                      type: array
                      items:
                        type: string
                        format: uri
                      description: >-
                        Enter a list of video URLs or asset://{assetId} (for
                        example: asset://asset-20260404242101-76djj) .

                        Single video requirements:

                        Video format: mp4, mov.

                        Resolution: 480p, 720p

                        Duration: Single video duration [2, 15] s, maximum 3
                        reference videos, total duration of all videos not
                        exceeding 15 seconds.

                        Dimensions:

                        Aspect ratio (width/height): [0.4, 2.5]

                        Width/height (px): [300, 6000]

                        Total pixels: [640×640=409600, 834×1112=927408], i.e.,
                        the product of width and height must meet the range
                        requirement of [409600, 927408].

                        Size: Single video not exceeding 50 MB.

                        Frame rate (FPS): [24, 60]
                      maxItems: 3
                    reference_audio_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                      description: >-
                        Enter a list of audio URLs or asset://{assetId} (for
                        example: asset://asset-20260404242101-76djj) .

                        Single audio requirements:

                        Format: wav, mp3

                        Duration: Single audio duration [2, 15] s, maximum 3
                        reference audios, total duration of all audios not
                        exceeding 15 s.

                        Size: Single audio file size not exceeding 15 MB.
                      maxItems: 3
                    return_last_frame:
                      type: boolean
                      description: >-
                        Whether to return the last frame of the video as an
                        image.
                      default: false
                      deprecated: true
                    generate_audio:
                      description: |-
                        Whether to generate audio for the video.

                        - **true**: Generate with audio (higher cost)
                        - **false**: Generate without audio

                        Note: Enabling audio will increase the generation cost
                      type: boolean
                      default: true
                      examples:
                        - false
                    resolution:
                      type: string
                      description: >-
                        Video resolution - 480p for faster generation, 720p for
                        balance, 1080p for High-quality video
                      enum:
                        - 480p
                        - 720p
                        - 1080p
                      default: 720p
                      examples:
                        - 720p
                      x-apidog-enum:
                        - value: 480p
                          name: ""
                          description: ""
                        - value: 720p
                          name: ""
                          description: ""
                        - value: 1080p
                          name: ""
                          description: ""
                    aspect_ratio:
                      type: string
                      description: Video aspect ratio configuration. Required field.
                      enum:
                        - "1:1"
                        - "4:3"
                        - "3:4"
                        - "16:9"
                        - "9:16"
                        - "21:9"
                        - adaptive
                      default: "16:9"
                      x-apidog-enum:
                        - value: "1:1"
                          name: ""
                          description: ""
                        - value: "4:3"
                          name: ""
                          description: ""
                        - value: "3:4"
                          name: ""
                          description: ""
                        - value: "16:9"
                          name: ""
                          description: ""
                        - value: "9:16"
                          name: ""
                          description: ""
                        - value: "21:9"
                          name: ""
                          description: ""
                        - value: adaptive
                          name: ""
                          description: ""
                      examples:
                        - "16:9"
                    duration:
                      type: integer
                      description: Video duration in 4-15 seconds.
                      default: 5
                      examples:
                        - 5
                    web_search:
                      type: boolean
                      description: Use online search
                    nsfw_checker:
                      type: boolean
                      description: >-
                        Defaults to false. You can set it to false based on your
                        needs. If set to false, our content filtering will be
                        disabled, and all results will be returned directly by
                        the model itself.
                      default: false
                  x-apidog-orders:
                    - prompt
                    - first_frame_url
                    - last_frame_url
                    - reference_image_urls
                    - "reference_video_urls "
                    - reference_audio_urls
                    - return_last_frame
                    - generate_audio
                    - resolution
                    - aspect_ratio
                    - duration
                    - web_search
                    - nsfw_checker
                  x-apidog-ignore-properties: []
              x-apidog-orders:
                - model
                - callBackUrl
                - input
              x-apidog-ignore-properties: []
            example:
              model: bytedance/seedance-2
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  A serene beach at sunset with waves gently crashing on the
                  shore, palm trees swaying in the breeze, and seagulls flying
                  across the orange sky
                first_frame_url: >-
                  https://templateb.aiquickdraw.com/custom-page/akr/section-images/example2.png
                last_frame_url: >-
                  https://templateb.aiquickdraw.com/custom-page/akr/section-images/example3.png
                reference_image_urls:
                  - >-
                    https://templateb.aiquickdraw.com/custom-page/akr/section-images/example1.png
                reference_video_urls:
                  - >-
                    https://templateb.aiquickdraw.com/custom-page/akr/section-images/example1.mp4
                reference_audio_urls:
                  - >-
                    https://templateb.aiquickdraw.com/custom-page/akr/section-images/example1.mp3
                return_last_frame: false
                generate_audio: false
                resolution: 720p
                aspect_ratio: "16:9"
                duration: 15
                web_search: false
      responses:
        "200":
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - $ref: "#/components/schemas/ApiResponse"
              example:
                code: 200
                msg: success
                data:
                  taskId: task_bytedance_1765186743319
          headers: {}
          x-apidog-name: ""
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/en/Market/Video Models/Bytedance
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-32356532-run
components:
  schemas:
    ApiResponse:
      type: object
      properties:
        code:
          type: integer
          description: >-
            Response status code


            - **200**: Success - Request has been processed successfully

            - **401**: Unauthorized - Authentication credentials are missing or
            invalid

            - **402**: Insufficient Credits - Account does not have enough
            credits to perform the operation

            - **404**: Not Found - The requested resource or endpoint does not
            exist

            - **422**: Validation Error - The request parameters failed
            validation checks

            - **429**: Rate Limited - Request limit has been exceeded for this
            resource

            - **433**: Request Limit - Sub-key Usage Exceeds Limit

            - **455**: Service Unavailable - System is currently undergoing
            maintenance

            - **500**: Server Error - An unexpected error occurred while
            processing the request

            - **501**: Generation Failed - Content generation task failed

            - **505**: Feature Disabled - The requested feature is currently
            disabled
          enum:
            - 200
            - 401
            - 402
            - 404
            - 422
            - 429
            - 433
            - 455
            - 500
            - 501
            - 505
          x-apidog-enum:
            - value: 200
              name: ""
              description: ""
            - value: 401
              name: ""
              description: ""
            - value: 402
              name: ""
              description: ""
            - value: 404
              name: ""
              description: ""
            - value: 422
              name: ""
              description: ""
            - value: 429
              name: ""
              description: ""
            - value: 433
              name: ""
              description: ""
            - value: 455
              name: ""
              description: ""
            - value: 500
              name: ""
              description: ""
            - value: 501
              name: ""
              description: ""
            - value: 505
              name: ""
              description: ""
        msg:
          type: string
          description: Response message, error description when failed
          examples:
            - success
        data:
          type: object
          properties:
            taskId:
              type: string
              description: >-
                Task ID, can be used with Get Task Details endpoint to query
                task status
          x-apidog-orders:
            - taskId
          required:
            - taskId
          x-apidog-ignore-properties: []
      x-apidog-orders:
        - code
        - msg
        - data
      title: response not with recordId
      required:
        - data
      x-apidog-ignore-properties: []
      x-apidog-folder: ""
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 都需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意事项：
        - 请妥善保管您的 API Key，切勿泄露给他人
        - 若怀疑 API Key 泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []
```

# File Upload API Quickstart

> Start using the File Upload API in minutes with multiple upload methods

## Welcome to the File Upload API

The File Upload API provides flexible and efficient file upload services with multiple upload methods to meet various business needs. Whether it's remote file migration, large file transfers, or quick small file uploads, our API offers the best solutions for you.

<CardGroup cols={3}>
  <Card title="Base64 Upload" icon="lucide-code" href="/file-upload-api/upload-file-base-64">
    Base64 encoded file upload, suitable for small files
  </Card>

  <Card title="File Stream Upload" icon="lucide-upload" href="/file-upload-api/upload-file-stream">
    Efficient binary file stream upload, suitable for large files
  </Card>

  <Card title="URL File Upload" icon="lucide-link" href="/file-upload-api/upload-file-url">
    Automatically download and upload files from remote URLs
  </Card>
</CardGroup>

:::info[**File uploads are free**]
Uploading files to our service incurs no charges. You can upload files confidently without worrying about upload costs or fees.
:::

:::warning[**Important Reminder**]
Uploaded files are temporary and will be automatically deleted after **3 days**. Please download or migrate important files promptly.
:::

## Authentication

All API requests require authentication using a Bearer token. Please obtain your API key from the [API Key Management page](https://kie.ai/api-key).

:::warning[]
Please keep your API key secure and never share it publicly. If you suspect your key has been compromised, reset it immediately.
:::

### API Base URL

```
https://kieai.redpandaai.co
```

### Authentication Header

```http
Authorization: Bearer YOUR_API_KEY
```

## Quick Start Guide

### Step 1: Choose Upload Method

Select the appropriate upload method based on your needs:

<Tabs>
  <TabItem value="url-upload" label="URL File Upload">
    Suitable for downloading and uploading files from remote servers:

    <Tabs groupId="programming-language">
      <TabItem value="bash" label="cURL">
        ```bash
        curl -X POST "https://kieai.redpandaai.co/api/file-url-upload" \
          -H "Authorization: Bearer YOUR_API_KEY" \
          -H "Content-Type: application/json" \
          -d '{
            "fileUrl": "https://example.com/sample-image.jpg",
            "uploadPath": "images",
            "fileName": "my-image.jpg"
          }'
        ```
      </TabItem>

      <TabItem value="javascript" label="JavaScript">
        ```javascript
        const response = await fetch('https://kieai.redpandaai.co/api/file-url-upload', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer YOUR_API_KEY',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileUrl: 'https://example.com/sample-image.jpg',
            uploadPath: 'images',
            fileName: 'my-image.jpg'
          })
        });

        const result = await response.json();
        console.log('Upload successful:', result);
        ```
      </TabItem>

      <TabItem value="python" label="Python">
        ```python
        import requests

        url = "https://kieai.redpandaai.co/api/file-url-upload"
        headers = {
            "Authorization": "Bearer YOUR_API_KEY",
            "Content-Type": "application/json"
        }

        payload = {
            "fileUrl": "https://example.com/sample-image.jpg",
            "uploadPath": "images",
            "fileName": "my-image.jpg"
        }

        response = requests.post(url, json=payload, headers=headers)
        result = response.json()

        print(f"Upload successful: {result}")
        ```
      </TabItem>
    </Tabs>

  </TabItem>

  <TabItem value="stream-upload" label="File Stream Upload">
    Suitable for directly uploading local files, especially large files:

    <Tabs groupId="programming-language">
      <TabItem value="bash" label="cURL">
        ```bash
        curl -X POST "https://kieai.redpandaai.co/api/file-stream-upload" \
          -H "Authorization: Bearer YOUR_API_KEY" \
          -F "file=@/path/to/your-file.jpg" \
          -F "uploadPath=images/user-uploads" \
          -F "fileName=custom-name.jpg"
        ```
      </TabItem>

      <TabItem value="javascript" label="JavaScript">
        ```javascript
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('uploadPath', 'images/user-uploads');
        formData.append('fileName', 'custom-name.jpg');

        const response = await fetch('https://kieai.redpandaai.co/api/file-stream-upload', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer YOUR_API_KEY'
          },
          body: formData
        });

        const result = await response.json();
        console.log('Upload successful:', result);
        ```
      </TabItem>

      <TabItem value="python" label="Python">
        ```python
        import requests

        url = "https://kieai.redpandaai.co/api/file-stream-upload"
        headers = {
            "Authorization": "Bearer YOUR_API_KEY"
        }

        files = {
            'file': ('your-file.jpg', open('/path/to/your-file.jpg', 'rb')),
            'uploadPath': (None, 'images/user-uploads'),
            'fileName': (None, 'custom-name.jpg')
        }

        response = requests.post(url, headers=headers, files=files)
        result = response.json()

        print(f"Upload successful: {result}")
        ```
      </TabItem>
    </Tabs>

  </TabItem>

  <TabItem value="base64-upload" label="Base64 Upload">
    Suitable for Base64 encoded file data:

    <Tabs groupId="programming-language">
      <TabItem value="bash" label="cURL">
        ```bash
        curl -X POST "https://kieai.redpandaai.co/api/file-base64-upload" \
          -H "Authorization: Bearer YOUR_API_KEY" \
          -H "Content-Type: application/json" \
          -d '{
            "base64Data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
            "uploadPath": "images",
            "fileName": "base64-image.png"
          }'
        ```
      </TabItem>

      <TabItem value="javascript" label="JavaScript">
        ```javascript
        const response = await fetch('https://kieai.redpandaai.co/api/file-base64-upload', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer YOUR_API_KEY',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            base64Data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
            uploadPath: 'images',
            fileName: 'base64-image.png'
          })
        });

        const result = await response.json();
        console.log('Upload successful:', result);
        ```
      </TabItem>

      <TabItem value="python" label="Python">
        ```python
        import requests
        import base64

        # Read file and convert to base64
        with open('/path/to/your-file.jpg', 'rb') as f:
            file_data = base64.b64encode(f.read()).decode('utf-8')
            base64_data = f'data:image/jpeg;base64,{file_data}'

        url = "https://kieai.redpandaai.co/api/file-base64-upload"
        headers = {
            "Authorization": "Bearer YOUR_API_KEY",
            "Content-Type": "application/json"
        }

        payload = {
            "base64Data": base64_data,
            "uploadPath": "images",
            "fileName": "base64-image.jpg"
        }

        response = requests.post(url, json=payload, headers=headers)
        result = response.json()

        print(f"Upload successful: {result}")
        ```
      </TabItem>
    </Tabs>

  </TabItem>
</Tabs>

### Additional Step 1: fileName Parameter Explanation

:::info[]
The `fileName` parameter is optional across all upload methods, with the following behavior:
:::

#### `fileName` (string, optional)

**Filename behavior description:**

- If no filename is provided, a random filename will be automatically generated
- If the new uploaded filename matches an existing one, the old file will be overwritten
- Due to caching, this change may not take effect immediately when overwriting files

**Examples:**

```javascript
// No fileName provided - auto-generate random filename
{ uploadPath: "images" } // → generates "abc123.jpg"

// Provide fileName - use specified filename
{ uploadPath: "images", fileName: "my-photo.jpg" }

// Overwrite file - replace existing file (with caching delay)
{ uploadPath: "images", fileName: "my-photo.jpg" } // Overwrites previous file
```

### Step 2: Handle Response

After successful upload, you'll receive a response containing file information:

```json
{
  "success": true,
  "code": 200,
  "msg": "File upload successful",
  "data": {
    "fileId": "file_abc123456",
    "fileName": "my-image.jpg",
    "originalName": "sample-image.jpg",
    "fileSize": 245760,
    "mimeType": "image/jpeg",
    "uploadPath": "images",
    "fileUrl": "https://kieai.redpandaai.co/files/images/my-image.jpg",
    "downloadUrl": "https://kieai.redpandaai.co/download/file_abc123456",
    "uploadTime": "2025-01-15T10:30:00Z",
    "expiresAt": "2025-01-18T10:30:00Z"
  }
}
```

## Upload Method Comparison

Choose the upload method best suited to your needs:

<CardGroup cols={3}>
  <Card title="URL File Upload" icon="lucide-link">
    **Best for**: File migration, batch processing

    **Advantages**:

    * No local file required
    * Automatic download processing
    * Supports remote resources

    **Limitations**:

    * Requires publicly accessible URL
    * 30-second download timeout
    * Recommended ≤100MB

  </Card>

  <Card title="File Stream Upload" icon="lucide-upload">
    **Best for**: Large files, local files

    **Advantages**:

    * High transfer efficiency
    * Supports large files
    * Binary transmission

    **Limitations**:

    * Requires local file
    * Server processing time

  </Card>

  <Card title="Base64 Upload" icon="lucide-code">
    **Best for**: Small files, API integration

    **Advantages**:

    * JSON format transmission
    * Easy integration
    * Supports Data URLs

    **Limitations**:

    * Data size increases by 33%
    * Not suitable for large files
    * Recommended ≤10MB

  </Card>
</CardGroup>

## Practical Examples

### Batch File Upload

Process multiple files using file stream upload:

<Tabs groupId="programming-language">
  <TabItem value="javascript" label="JavaScript">
    ```javascript
    class FileUploadAPI {
      constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://kieai.redpandaai.co';
      }
      
      async uploadFile(file, uploadPath = '', fileName = null) {
        const formData = new FormData();
        formData.append('file', file);
        if (uploadPath) formData.append('uploadPath', uploadPath);
        if (fileName) formData.append('fileName', fileName);
        
        const response = await fetch(`${this.baseUrl}/api/file-stream-upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: formData
        });
        
        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }
        
        return response.json();
      }
      
      async uploadFromUrl(fileUrl, uploadPath = '', fileName = null) {
        const response = await fetch(`${this.baseUrl}/api/file-url-upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileUrl,
            uploadPath,
            fileName
          })
        });
        
        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }
        
        return response.json();
      }
      
      async uploadBase64(base64Data, uploadPath = '', fileName = null) {
        const response = await fetch(`${this.baseUrl}/api/file-base64-upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            base64Data,
            uploadPath,
            fileName
          })
        });
        
        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }
        
        return response.json();
      }
    }

    // Usage example
    const uploader = new FileUploadAPI('YOUR_API_KEY');

    // Batch upload files
    async function uploadMultipleFiles(files) {
      const results = [];

      for (let i = 0; i < files.length; i++) {
        try {
          const result = await uploader.uploadFile(
            files[i],
            'user-uploads',
            `file-${i + 1}-${files[i].name}`
          );
          results.push(result);
          console.log(`File ${i + 1} upload successful:`, result.data.fileUrl);
        } catch (error) {
          console.error(`File ${i + 1} upload failed:`, error.message);
        }
      }

      return results;
    }

    // Batch upload from URLs
    async function uploadFromUrls(urls) {
      const results = [];

      for (let i = 0; i < urls.length; i++) {
        try {
          const result = await uploader.uploadFromUrl(
            urls[i],
            'downloads',
            `download-${i + 1}.jpg`
          );
          results.push(result);
          console.log(`URL ${i + 1} upload successful:`, result.data.fileUrl);
        } catch (error) {
          console.error(`URL ${i + 1} upload failed:`, error.message);
        }
      }

      return results;
    }
    ```

  </TabItem>

  <TabItem value="python" label="Python">
    ```python
    import requests
    import base64
    import os
    from typing import List, Optional

    class FileUploadAPI:
        def __init__(self, api_key: str):
            self.api_key = api_key
            self.base_url = 'https://kieai.redpandaai.co'
            self.headers = {
                'Authorization': f'Bearer {api_key}'
            }

        def upload_file(self, file_path: str, upload_path: str = '',
                       file_name: Optional[str] = None) -> dict:
            """File stream upload"""
            files = {
                'file': (os.path.basename(file_path), open(file_path, 'rb'))
            }

            data = {}
            if upload_path:
                data['uploadPath'] = upload_path
            if file_name:
                data['fileName'] = file_name

            response = requests.post(
                f'{self.base_url}/api/file-stream-upload',
                headers=self.headers,
                files=files,
                data=data
            )

            if not response.ok:
                raise Exception(f'Upload failed: {response.text}')

            return response.json()

        def upload_from_url(self, file_url: str, upload_path: str = '',
                           file_name: Optional[str] = None) -> dict:
            """URL file upload"""
            payload = {
                'fileUrl': file_url,
                'uploadPath': upload_path,
                'fileName': file_name
            }

            response = requests.post(
                f'{self.base_url}/api/file-url-upload',
                headers={**self.headers, 'Content-Type': 'application/json'},
                json=payload
            )

            if not response.ok:
                raise Exception(f'Upload failed: {response.text}')

            return response.json()

        def upload_base64(self, base64_data: str, upload_path: str = '',
                         file_name: Optional[str] = None) -> dict:
            """Base64 file upload"""
            payload = {
                'base64Data': base64_data,
                'uploadPath': upload_path,
                'fileName': file_name
            }

            response = requests.post(
                f'{self.base_url}/api/file-base64-upload',
                headers={**self.headers, 'Content-Type': 'application/json'},
                json=payload
            )

            if not response.ok:
                raise Exception(f'Upload failed: {response.text}')

            return response.json()

    # Usage example
    def main():
        uploader = FileUploadAPI('YOUR_API_KEY')

        # Batch upload local files
        file_paths = [
            '/path/to/file1.jpg',
            '/path/to/file2.png',
            '/path/to/document.pdf'
        ]

        print("Starting batch file upload...")
        for i, file_path in enumerate(file_paths):
            try:
                result = uploader.upload_file(
                    file_path,
                    'user-uploads',
                    f'file-{i + 1}-{os.path.basename(file_path)}'
                )
                print(f"File {i + 1} upload successful: {result['data']['fileUrl']}")
            except Exception as e:
                print(f"File {i + 1} upload failed: {e}")

        # Batch upload from URLs
        urls = [
            'https://example.com/image1.jpg',
            'https://example.com/image2.png'
        ]

        print("\nStarting batch URL upload...")
        for i, url in enumerate(urls):
            try:
                result = uploader.upload_from_url(
                    url,
                    'downloads',
                    f'download-{i + 1}.jpg'
                )
                print(f"URL {i + 1} upload successful: {result['data']['fileUrl']}")
            except Exception as e:
                print(f"URL {i + 1} upload failed: {e}")

    if __name__ == '__main__':
        main()
    ```

  </TabItem>
</Tabs>

## Error Handling

Common errors and how to handle them:

<details>
  <summary>401 Unauthorized</summary>

```javascript
// Check if API key is correct
if (response.status === 401) {
  console.error("Invalid API key, please check Authorization header");
  // Re-obtain or update API key
}
```

</details>

<details>
  <summary>400 Bad Request</summary>

```javascript
// Check request parameters
if (response.status === 400) {
  const error = await response.json();
  console.error("Request parameter error:", error.msg);
  // Check if required parameters are provided
  // Check if file format is supported
  // Check if URL is accessible
}
```

</details>

<details>
  <summary>500 Server Error</summary>

```javascript
// Implement retry mechanism
async function uploadWithRetry(uploadFunction, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await uploadFunction();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      // Exponential backoff
      const delay = Math.pow(2, i) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
```

</details>

## Best Practices

<details>
  <summary>File Size Optimization</summary>
  * **Small files** (≤1MB): Recommended to use Base64 upload
  * **Medium files** (1MB-10MB): Recommended to use file stream upload
  * **Large files** (>10MB): Must use file stream upload
  * **Remote files**: Use URL upload, note 100MB limit
</details>

<details>
  <summary>Performance Optimization</summary>
  * Implement concurrency control to avoid uploading too many files simultaneously
  * Consider chunked upload strategy for large files
  * Use appropriate retry mechanisms for network issues
  * Monitor upload progress and provide user feedback
</details>

<details>
  <summary>Security Considerations</summary>
  * Keep API keys secure and rotate regularly
  * Validate file types and sizes
  * Consider encrypted transmission for sensitive files
  * Download important files promptly to avoid deletion after 3 days
</details>

<details>
  <summary>Error Handling</summary>
  * Implement comprehensive error handling logic
  * Maintain upload logs for troubleshooting
  * Provide user-friendly error messages
  * Offer retry options for failed uploads
</details>

## File Storage Information

:::warning[**Important Reminder**]
All uploaded files are temporary and will be automatically deleted **3 days** after upload.
:::

- Files are accessible and downloadable immediately after upload
- File URLs remain valid for 3 days
- The system provides an `expiresAt` field in the response indicating expiration time
- Recommended to download or migrate important files before expiration
- Use the `downloadUrl` field to get direct download links

## Status Codes

- **200** (Success): Request successfully processed, file upload completed
- **400** (Bad Request): Incorrect request parameters or missing required parameters
- **401** (Unauthorized): Missing authentication credentials or invalid credentials
- **405** (Method Not Allowed): Unsupported request method, check HTTP method
- **500** (Server Error): Unexpected error occurred while processing request, please retry or contact support

## Next Steps

<CardGroup cols={3}>
  <Card title="URL File Upload" icon="lucide-link" href="/file-upload-api/upload-file-url">
    Learn how to upload files from remote URLs
  </Card>

  <Card title="File Stream Upload" icon="lucide-upload" href="/file-upload-api/upload-file-stream">
    Learn efficient file stream upload methods
  </Card>

  <Card title="Base64 Upload" icon="lucide-code" href="/file-upload-api/upload-file-base-64">
    Master Base64 encoded file upload
  </Card>
</CardGroup>

## Support

:::info[]
Need help? Our technical support team is here for you.

- **Email**: [support@kie.ai](mailto:support@kie.ai)
- **Documentation**: [docs.kie.ai](https://docs.kie.ai)
- **API Status**: Check our status page for real-time API health
  :::

---

Ready to start uploading files? [Get your API key](https://kie.ai/api-key) and begin using the file upload service now!
