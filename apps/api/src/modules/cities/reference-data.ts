import type { Pool } from 'pg';

export interface CuratedCity {
  readonly name: string;
  readonly region: string;
  readonly country: string;
  readonly timezone: string;
}

export const CURATED_CITIES: readonly CuratedCity[] = [
  { name: 'Ahmedabad', region: 'GJ', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Amritsar', region: 'PB', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Bengaluru', region: 'KA', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Bhopal', region: 'MP', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Chandigarh', region: 'CH', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Chennai', region: 'TN', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Coimbatore', region: 'TN', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Delhi', region: 'DL', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Hyderabad', region: 'TG', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Indore', region: 'MP', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Jaipur', region: 'RJ', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Kochi', region: 'KL', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Kolkata', region: 'WB', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Lucknow', region: 'UP', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Ludhiana', region: 'PB', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Mumbai', region: 'MH', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Mysuru', region: 'KA', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Nagpur', region: 'MH', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Nashik', region: 'MH', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Pune', region: 'MH', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Surat', region: 'GJ', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Thiruvananthapuram', region: 'KL', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Udaipur', region: 'RJ', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Varanasi', region: 'UP', country: 'IN', timezone: 'Asia/Kolkata' },
  { name: 'Vadodara', region: 'GJ', country: 'IN', timezone: 'Asia/Kolkata' },
];

export interface ProvisionResult {
  readonly curated: number;
}

export async function provisionCuratedCities(db: Pool): Promise<ProvisionResult> {
  for (const city of CURATED_CITIES) {
    await db.query(
      `INSERT INTO cities (name, region, country, timezone, active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (country, region, name)
       DO UPDATE SET timezone = EXCLUDED.timezone, active = true`,
      [city.name, city.region, city.country, city.timezone],
    );
  }
  return { curated: CURATED_CITIES.length };
}
