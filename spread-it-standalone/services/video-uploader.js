const fs = require('fs');
const axios = require('axios');
const { google } = require('googleapis');
const path = require('path');

/* 
 * VIDEO UPLOADER SERVICE
 * Handles uploading to YouTube Shorts and TikTok
 */

class VideoUploader {

    /**
     * Upload to YouTube Shorts
     * @param {string} filePath - Local path to video file
     * @param {string} title - Video title (max 100 chars)
     * @param {string} description - Video description
     * @param {string[]} tags - Array of tags
     */
    static async uploadYouTubeShorts(filePath, title, description, tags = []) {
        console.log("🎥 Starting YouTube Shorts Upload...");

        const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
        const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
        const REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN;

        if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
            throw new Error("Missing YouTube Credentials (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN)");
        }

        const oauth2Client = new google.auth.OAuth2(
            CLIENT_ID,
            CLIENT_SECRET,
            "https://developers.google.com/oauthplayground" // Redirect URI used often for generating tokens
        );

        oauth2Client.setCredentials({
            refresh_token: REFRESH_TOKEN
        });

        const youtube = google.youtube({
            version: 'v3',
            auth: oauth2Client
        });

        // Add #Shorts tag if not present to Ensure it hits the Shorts shelf
        if (!title.toLowerCase().includes('#shorts') && !description.toLowerCase().includes('#shorts')) {
            title = (title + " #Shorts").substring(0, 100);
        }

        const fileSize = fs.statSync(filePath).size;
        
        try {
            const res = await youtube.videos.insert({
                part: 'snippet,status',
                requestBody: {
                    snippet: {
                        title: title.substring(0, 100),
                        description: description,
                        tags: tags,
                        categoryId: '22' // People & Blogs
                    },
                    status: {
                        privacyStatus: 'public', // or 'private' for safety
                        selfDeclaredMadeForKids: false
                    }
                },
                media: {
                    body: fs.createReadStream(filePath)
                }
            });

            console.log(`✅ YouTube Upload Success: https://youtu.be/${res.data.id}`);
            return {
                id: res.data.id,
                url: `https://youtu.be/${res.data.id}`,
                platform: 'youtube'
            };
        } catch (error) {
            console.error("❌ YouTube Upload Error:", error.response ? error.response.data : error.message);
            throw new Error(`YouTube Upload Failed: ${error.message}`);
        }
    }

    /**
     * Upload to TikTok
     * Uses TikTok Display API v2 (Direct Post)
     * Note: Requires 'video.upload' scope
     */
    static async uploadTikTok(filePath, title) {
        console.log("🎵 Starting TikTok Upload...");

        const ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN;
        const OPEN_ID = process.env.TIKTOK_OPEN_ID; // Optional for some calls, but good to have context

        if (!ACCESS_TOKEN) {
            throw new Error("Missing TIKTOK_ACCESS_TOKEN");
        }

        // 1. INIT UPLOAD
        // https://developers.tiktok.com/doc/content-posting-api-reference-upload-video
        const fileSize = fs.statSync(filePath).size;
        
        try {
            console.log("Step 1: Init TikTok Upload...");
            const initRes = await axios.post('https://open.tiktokapis.com/v2/post/publish/video/init/', {
                post_info: {
                    title: title.substring(0, 150), // TikTok max length hint
                    privacy_level: 'PUBLIC_TO_EVERYONE',
                    brand_content_toggle: false,
                    brand_organic_toggle: false
                },
                source_info: {
                    source: 'FILE_UPLOAD',
                    video_size: fileSize,
                    chunk_size: fileSize, // Uploading in 1 chunk for simplicity
                    total_chunk_count: 1
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
                    'Content-Type': 'application/json; charset=UTF-8'
                }
            });

            const { publish_id, upload_url } = initRes.data.data;
            if (!upload_url) throw new Error("No upload_url returned from TikTok Init");

            // 2. UPLOAD BINARY
            console.log("Step 2: Uploading binary to TikTok CDN...");
            const fileStream = fs.readFileSync(filePath); // Read into memory for axios PUT (better for small files < 50MB)
            
            await axios.put(upload_url, fileStream, {
                headers: {
                    'Content-Type': 'video/mp4',
                    'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`
                }
            });

            // Note: TikTok API doesn't always require a finalize step if 'chunk_size' == 'video_size'
            // But we should check status? 
            // Actually, for the v2/post/publish/video/init endpoint, usually after the PUT to upload_url, it triggers the processing asynchronously.
            // There isn't a "finalize" call in the v2 "Direct Post" basic flow if simplified.
            
            console.log(`✅ TikTok Upload Initiated. Publish ID: ${publish_id}`);
            return {
                id: publish_id,
                platform: 'tiktok',
                status: 'processing'
            };

        } catch (error) {
            console.error("❌ TikTok Upload Error:", error.response ? error.response.data : error.message);
            // Handle specific TikTok errors
            if (error.response && error.response.data && error.response.data.error && error.response.data.error.code === 'spam_risk_too_many_posts') {
                 throw new Error("TikTok Rate Limit: Spam Risk");
            }
            throw new Error(`TikTok Upload Failed: ${error.message}`);
        }
    }
}

module.exports = VideoUploader;
