import {z} from 'zod';
import {LangfuseSpanClient} from 'langfuse';
import {Client, TravelMode, PlaceInputType} from '@googlemaps/google-maps-services-js';
import {stateManager} from '../agent/state.service';
import {documentService} from '../agent/document.service';
import type {DocumentType} from '../agent/document.service';

const placeDetailsSchema = z.object({
  place_id: z.string()
});

const directionsSchema = z.object({
  origin: z.string(),
  destination: z.string(),
  mode: z.enum(['driving', 'walking']).default('driving')
});

const searchPlaceSchema = z.object({
  query: z.string()
});

const client = new Client({});

const extractPlaceDetails = (place: any) => ({
  name: place.name,
  address: place.formatted_address,
  location: place.geometry?.location,
  placeId: place.place_id,
  rating: place.rating,
  totalRatings: place.user_ratings_total,
  phoneNumber: place.formatted_phone_number,
  website: place.website,
  openingHours: place.opening_hours?.weekday_text,
  priceLevel: place.price_level,
  types: place.types,
  reviews: place.reviews?.map((review: any) => ({
    author: review.author_name,
    rating: review.rating,
    text: review.text,
    time: new Date(review.time * 1000).toISOString(),
  }))
});

const extractDirectionsInfo = (data: any) => {
  if (!data.routes?.[0]) return null;
  
  const route = data.routes[0];
  const leg = route.legs[0];

  return {
    distance: leg.distance.text,
    duration: leg.duration.text,
    startAddress: leg.start_address,
    endAddress: leg.end_address,
    steps: leg.steps.map((step: any) => ({
      distance: step.distance.text,
      duration: step.duration.text,
      instructions: step.html_instructions,
    })),
    summary: route.summary,
    warnings: route.warnings,
  };
};

const mapService = {
  execute: async (action: string, payload: unknown, span?: LangfuseSpanClient): Promise<DocumentType> => {
    try {
      const state = stateManager.getState();
      const conversation_uuid = state.config.conversation_uuid ?? 'unknown';
      const api_key = process.env.GOOGLE_API_KEY;

      if (!api_key) {
        throw new Error('Google Maps API key is not configured');
      }

      span?.event({
        name: 'map_tool_execute',
        input: {action, payload}
      });

      if (action === 'search_place') {
        const {query} = searchPlaceSchema.parse(payload);
        
        const response = await client.findPlaceFromText({
          params: {
            input: query,
            inputtype: PlaceInputType.textQuery,
            fields: ['name', 'formatted_address', 'geometry', 'place_id'],
            key: api_key,
          }
        });

        const places = response.data.candidates;
        
        return documentService.createDocument({
          conversation_uuid,
          source_uuid: conversation_uuid,
          text: `Here are the places I found for your query: ${JSON.stringify(places, null, 2)}. You can use the place ID to get more information about them.`,
          metadata_override: {
            type: 'text',
            content_type: 'full',
            name: `Search results for: ${query}`,
            source: 'google_maps',
            mimeType: 'application/json',
            description: `Places found for query: ${query}`
          }
        });
      }

      if (action === 'place_details') {
        const {place_id} = placeDetailsSchema.parse(payload);
        
        const response = await client.placeDetails({
          params: {
            place_id,
            fields: [
              'name', 'formatted_address', 'geometry', 'place_id',
              'rating', 'user_ratings_total', 'formatted_phone_number',
              'website', 'opening_hours', 'price_level', 'types', 'reviews'
            ],
            key: api_key,
          }
        });

        const details = extractPlaceDetails(response.data.result);
        
        return documentService.createDocument({
          conversation_uuid,
          source_uuid: conversation_uuid,
          text: JSON.stringify(details, null, 2),
          metadata_override: {
            type: 'text',
            content_type: 'full',
            name: details.name,
            source: 'google_maps',
            mimeType: 'application/json',
            description: `Place details for: ${details.name}`
          }
        });
      }

      if (action === 'directions') {
        const {origin, destination, mode} = directionsSchema.parse(payload);
        
        const response = await client.directions({
          params: {
            origin,
            destination,
            mode: mode === 'driving' ? TravelMode.driving : TravelMode.walking,
            key: api_key,
          }
        });

        const directions = extractDirectionsInfo(response.data);
        
        return documentService.createDocument({
          conversation_uuid,
          source_uuid: conversation_uuid,
          text: JSON.stringify(directions, null, 2),
          metadata_override: {
            type: 'text',
            content_type: 'full',
            name: `${origin} to ${destination}`,
            source: 'google_maps',
            mimeType: 'application/json',
            description: `Directions from ${origin} to ${destination}`
          }
        });
      }

      return documentService.createErrorDocument({
        error: new Error(`Unknown action: ${action}`),
        conversation_uuid,
        context: 'Invalid map operation requested'
      });
    } catch (error) {
      const state = stateManager.getState();
      return documentService.createErrorDocument({
        error,
        conversation_uuid: state.config.conversation_uuid ?? 'unknown',
        context: 'Failed to execute map operation'
      });
    }
  }
};

export {mapService};
