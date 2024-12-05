export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export interface SimplifiedTrack {
  name: string;
  uri: string;
  artists: string;
  album: string;
}

export interface SimplifiedPlaylist {
  name: string;
  uri: string;
  owner: string;
}

export interface SimplifiedAlbum {
  name: string;
  uri: string;
  artists: string;
}

export interface SimplifiedSearchResults {
  tracks: SimplifiedTrack[];
  playlists: SimplifiedPlaylist[];
  albums: SimplifiedAlbum[];
}
