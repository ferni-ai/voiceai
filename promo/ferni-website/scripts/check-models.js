#!/usr/bin/env node
/**
 * Check available Google AI models
 */

const API_KEY = process.env.GOOGLE_API_KEY;

async function listModels() {
  if (!API_KEY) {
    console.error('Set GOOGLE_API_KEY environment variable');
    process.exit(1);
  }
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
    );
    
    const data = await response.json();
    
    if (data.models) {
      console.log('Available Models:\n');
      
      const imageModels = data.models.filter(m => 
        m.name.includes('imagen') || 
        m.supportedGenerationMethods?.includes('generateImage')
      );
      
      const textModels = data.models.filter(m => 
        m.name.includes('gemini')
      );
      
      if (imageModels.length > 0) {
        console.log('🖼️  IMAGE GENERATION MODELS:');
        imageModels.forEach(m => {
          console.log(`   ${m.name}`);
          console.log(`      Methods: ${m.supportedGenerationMethods?.join(', ')}`);
        });
      } else {
        console.log('🖼️  IMAGE GENERATION MODELS: None available with this API key');
      }
      
      console.log('\n📝 TEXT/MULTIMODAL MODELS:');
      textModels.slice(0, 5).forEach(m => {
        console.log(`   ${m.name}`);
      });
      if (textModels.length > 5) {
        console.log(`   ... and ${textModels.length - 5} more`);
      }
      
    } else {
      console.log('Response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

listModels();

