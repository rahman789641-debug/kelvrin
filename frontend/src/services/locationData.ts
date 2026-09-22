export interface CountryOption {
  code: string;
  name: string;
}

export interface StateOption {
  code: string;
  name: string;
}

export const COUNTRIES: CountryOption[] = [
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SG', name: 'Singapore' },
  { code: 'DE', name: 'Germany' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'SA', name: 'Saudi Arabia' },
];

export const STATES_BY_COUNTRY: Record<string, StateOption[]> = {
  IN: [
    { code: 'TN', name: 'Tamil Nadu' },
    { code: 'KA', name: 'Karnataka' },
    { code: 'KL', name: 'Kerala' },
    { code: 'AP', name: 'Andhra Pradesh' },
    { code: 'TG', name: 'Telangana' },
    { code: 'MH', name: 'Maharashtra' },
    { code: 'DL', name: 'Delhi' },
    { code: 'GJ', name: 'Gujarat' },
    { code: 'UP', name: 'Uttar Pradesh' },
    { code: 'WB', name: 'West Bengal' },
    { code: 'RJ', name: 'Rajasthan' },
    { code: 'PB', name: 'Punjab' },
    { code: 'HR', name: 'Haryana' },
    { code: 'MP', name: 'Madhya Pradesh' },
    { code: 'BR', name: 'Bihar' },
    { code: 'OD', name: 'Odisha' },
    { code: 'AS', name: 'Assam' },
    { code: 'CH', name: 'Chandigarh' },
    { code: 'GA', name: 'Goa' },
    { code: 'JH', name: 'Jharkhand' },
    { code: 'UK', name: 'Uttarakhand' },
    { code: 'HP', name: 'Himachal Pradesh' },
    { code: 'PY', name: 'Puducherry' },
  ],
  US: [
    { code: 'CA', name: 'California' },
    { code: 'NY', name: 'New York' },
    { code: 'TX', name: 'Texas' },
    { code: 'FL', name: 'Florida' },
    { code: 'WA', name: 'Washington' },
    { code: 'IL', name: 'Illinois' },
    { code: 'MA', name: 'Massachusetts' },
  ],
  GB: [
    { code: 'ENG', name: 'England' },
    { code: 'SCT', name: 'Scotland' },
    { code: 'WLS', name: 'Wales' },
    { code: 'NIR', name: 'Northern Ireland' },
  ],
  AE: [
    { code: 'DXB', name: 'Dubai' },
    { code: 'AUH', name: 'Abu Dhabi' },
    { code: 'SHJ', name: 'Sharjah' },
    { code: 'AJM', name: 'Ajman' },
  ],
  SG: [
    { code: 'SG-C', name: 'Central Singapore' },
    { code: 'SG-E', name: 'Eastern Singapore' },
    { code: 'SG-W', name: 'Western Singapore' },
  ],
};

// Comprehensive list of all 38 administrative districts in Tamil Nadu
export const TAMIL_NADU_DISTRICTS: string[] = [
  'Ariyalur',
  'Chengalpattu',
  'Chennai',
  'Coimbatore',
  'Cuddalore',
  'Dharmapuri',
  'Dindigul',
  'Erode',
  'Kallakurichi',
  'Kanchipuram',
  'Kanyakumari',
  'Karur',
  'Krishnagiri',
  'Madurai',
  'Mayiladuthurai',
  'Nagapattinam',
  'Namakkal',
  'Nilgiris',
  'Perambalur',
  'Pudukkottai',
  'Ramanathapuram',
  'Ranipet',
  'Salem',
  'Sivaganga',
  'Tenkasi',
  'Thanjavur',
  'Theni',
  'Thoothukudi',
  'Tiruchirappalli',
  'Tirunelveli',
  'Tirupathur',
  'Tiruppur',
  'Tiruvallur',
  'Tiruvannamalai',
  'Tiruvarur',
  'Vellore',
  'Viluppuram',
  'Virudhunagar',
];

export const DISTRICTS_BY_STATE: Record<string, string[]> = {
  TN: TAMIL_NADU_DISTRICTS,
  KA: [
    'Bengaluru Urban',
    'Bengaluru Rural',
    'Mysuru',
    'Dakshina Kannada (Mangaluru)',
    'Udupi',
    'Belagavi',
    'Hubballi-Dharwad',
    'Kalaburagi',
    'Tumakuru',
    'Shivamogga',
    'Ballari',
  ],
  KL: [
    'Thiruvananthapuram',
    'Kollam',
    'Pathanamthitta',
    'Alappuzha',
    'Kottayam',
    'Idukki',
    'Ernakulam (Kochi)',
    'Thrissur',
    'Palakkad',
    'Malappuram',
    'Kozhikode',
    'Wayanad',
    'Kannur',
    'Kasaragod',
  ],
  AP: [
    'Visakhapatnam',
    'Vijayawada (NTR)',
    'Guntur',
    'Tirupati',
    'Kurnool',
    'Nellore',
    'Kakinada',
    'Anantapur',
    'Kadapa',
    'Chittoor',
  ],
  TG: [
    'Hyderabad',
    'Medchal-Malkajgiri',
    'Rangareddy',
    'Warangal',
    'Karimnagar',
    'Nizamabad',
    'Khammam',
    'Nalgonda',
  ],
  MH: [
    'Mumbai City',
    'Mumbai Suburban',
    'Pune',
    'Thane',
    'Nagpur',
    'Nashik',
    'Aurangabad (Chhatrapati Sambhajinagar)',
    'Kolhapur',
    'Solapur',
  ],
  DL: [
    'New Delhi',
    'Central Delhi',
    'South Delhi',
    'North Delhi',
    'East Delhi',
    'West Delhi',
  ],
  GJ: [
    'Ahmedabad',
    'Surat',
    'Vadodara',
    'Rajkot',
    'Bhavnagar',
    'Jamnagar',
    'Gandhinagar',
  ],
};

export function getCountries(): CountryOption[] {
  return COUNTRIES;
}

export function getStates(countryCode: string): StateOption[] {
  return STATES_BY_COUNTRY[countryCode] || [
    { code: 'DEFAULT', name: 'General / Federal Region' },
  ];
}

export function getDistricts(stateCode: string): string[] {
  return DISTRICTS_BY_STATE[stateCode] || [
    'Central District',
    'North District',
    'South District',
    'East District',
    'West District',
  ];
}
