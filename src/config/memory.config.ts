import type { NewCategory } from '../schema/category';

export const memory_categories: NewCategory[] = [
  // Profiles category and subcategories
  {
    uuid: '30e4cd03-bc16-4d11-807f-476f2695537d',
    name: 'profiles',
    subcategory: 'basic',
    description: 'name, age, origin, traits, descriptions'
  },
  {
    uuid: 'a3e33ca2-2ea4-4265-899e-cdebcbffcf7c',
    name: 'profiles',
    subcategory: 'work',
    description: 'projects, products, companies'
  },
  {
    uuid: '1de53e3e-747f-4edd-aff3-b90ae12c3f60',
    name: 'profiles',
    subcategory: 'development',
    description: 'learning, personal development, improvements'
  },
  {
    uuid: '1836e255-800a-49c3-aa33-e7ef09581013',
    name: 'profiles',
    subcategory: 'preferences',
    description: 'hobbies, music, gaming, reading, car, sport etc.'
  },
  {
    uuid: 'c3ef624a-471e-4481-b28a-e2f705f7ef58',
    name: 'profiles',
    subcategory: 'relationships',
    description: 'both personal and professional/work relationships'
  },

  // Events category
  {
    uuid: '726bc069-c69a-400b-b97a-6fe1d69c116b',
    name: 'events',
    subcategory: 'general',
    description: 'all events go here'
  },

  // Locations category
  {
    uuid: '4adb8937-f876-4b75-8e89-041811e4c248',
    name: 'locations',
    subcategory: 'places',
    description: 'all locations and places go here.'
  },

  // Resources category and subcategories
  {
    uuid: '9f8cbf57-7900-476f-87c8-119246b63a86',
    name: 'resources',
    subcategory: 'apps',
    description: 'links, tutorials and knowledge about tools, services and apps'
  },
  {
    uuid: 'b76b07e8-7268-4619-acb2-2f210ce7f422',
    name: 'resources',
    subcategory: 'devices',
    description: 'links, tutorials, manuals and knowledge about devices'
  },
  {
    uuid: '69bb9b16-9fac-4f41-aa1e-fac5eaba8fdf',
    name: 'resources',
    subcategory: 'books',
    description: 'links, opinions, summaries, notes from books'
  },
  {
    uuid: '7060a26b-0b36-4d89-8654-212495a97f18',
    name: 'resources',
    subcategory: 'courses',
    description: 'online courses, webinars, live meetings, workshops'
  },
  {
    uuid: '29cfadcc-647e-4f6c-81b1-4b786a4cd0b8',
    name: 'resources',
    subcategory: 'movies',
    description: 'links, opinions, reviews, notes from movies'
  },
  {
    uuid: '42e37a66-b184-4d01-877c-55f6b8030679',
    name: 'resources',
    subcategory: 'videos',
    description: 'links to the videos (mainly from youtube) and podcasts'
  },
  {
    uuid: 'eab5d5ed-63ac-4b23-b5b7-b03f260b486b',
    name: 'resources',
    subcategory: 'images',
    description: 'links to the photos, galleries, images'
  },
  {
    uuid: 'b900d022-e79a-4b08-bab1-cc41cf19fec3',
    name: 'resources',
    subcategory: 'communities',
    description: 'links, descriptions and notes about online communities'
  },
  {
    uuid: 'edad7c65-4df3-4603-9da6-a5cd8307dae8',
    name: 'resources',
    subcategory: 'music',
    description: 'links, opinions, preferences'
  },
  {
    uuid: '5d824a7d-f4a9-4bb1-b131-7dc3f84c886a',
    name: 'resources',
    subcategory: 'articles',
    description: 'links to the articles, blogs, newsletters etc'
  },
  {
    uuid: 'b4475cbd-9802-4f33-a366-2d4886c1068f',
    name: 'resources',
    subcategory: 'channels',
    description: 'links to the youtube channels'
  },
  {
    uuid: 'c4616ea4-50f4-4e53-a8ac-8e983b0709f9',
    name: 'resources',
    subcategory: 'documents',
    description: 'links to the papers, files etc.'
  },
  {
    uuid: '2c05e0c6-62f9-48c5-9aa1-7228b9fade7a',
    name: 'resources',
    subcategory: 'notepad',
    description: 'personal notes, sketches, drafts, ideas, concepts'
  },

  // Environment category
  {
    uuid: '305210d7-7103-47f5-87a8-ad5bdeeb9258',
    name: 'environment',
    subcategory: 'general',
    description: 'all information about current environment'
  }
];