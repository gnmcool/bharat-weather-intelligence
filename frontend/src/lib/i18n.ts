// Local-language support. Strings are machine-drafted and MUST be reviewed by native speakers /
// the State Agriculture Department before public release (see docs/LANGUAGES.md).
// Numbers stay in international digits (widely read); day names come from Intl in each locale.
import { useApp } from "./store";

export const LANGS = [
  { id: "en", label: "English", native: "English", bcp: "en-IN" },
  { id: "hi", label: "Hindi", native: "हिन्दी", bcp: "hi-IN" },
  { id: "gu", label: "Gujarati", native: "ગુજરાતી", bcp: "gu-IN" },
  { id: "mr", label: "Marathi", native: "मराठी", bcp: "mr-IN" },
  { id: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ", bcp: "pa-IN" },
  { id: "bn", label: "Bengali", native: "বাংলা", bcp: "bn-IN" },
  { id: "ta", label: "Tamil", native: "தமிழ்", bcp: "ta-IN" },
  { id: "te", label: "Telugu", native: "తెలుగు", bcp: "te-IN" },
  { id: "kn", label: "Kannada", native: "ಕನ್ನಡ", bcp: "kn-IN" },
  { id: "ml", label: "Malayalam", native: "മലയാളം", bcp: "ml-IN" },
  { id: "or", label: "Odia", native: "ଓଡ଼ିଆ", bcp: "or-IN" },
] as const;
export type Lang = (typeof LANGS)[number]["id"];

type Dict = Record<string, string>;

const en: Dict = {
  "mode.citizen": "My Weather", "mode.farmer": "Farmer", "mode.government": "Government", "mode.map": "Map",
  "search": "Search city, taluka or village…", "gps": "Use my location",
  "know": "What you should know", "no_risk": "No significant weather risks in the next 7 days.",
  "feels": "Feels", "today": "Today", "humidity": "Humidity", "wind": "Wind", "rain": "Rain", "temp": "Temperature",
  "official_warnings": "Official warnings", "risks": "Risk & impact — next 7 days", "next48": "Next 48 hours",
  "next10": "Next 10 days", "vs_normal": "Weather vs normal",
  "l0": "No risk", "l1": "Watch", "l2": "Alert", "l3": "Severe",
  "r.heat": "Heat", "r.cold": "Cold", "r.rain": "Heavy rain", "r.wind": "Strong wind", "r.thunderstorm": "Thunderstorm",
  "r.lightning": "Lightning", "r.flood": "Flood", "r.drought": "Dry spell", "r.fog": "Fog", "r.fire": "Fire weather", "r.cyclone": "Cyclone",
  "your_field": "Your field", "state": "State", "district": "District", "taluka": "Taluka / village", "crop": "Crop", "stage": "Growth stage",
  "listen": "Listen", "stop": "Stop", "simple": "Simple view", "detailed": "Detailed view",
  "week": "This week for your farm", "spray_ok": "Good for spraying", "dry_day": "Dry day",
  "official_adv": "Official agricultural advisory", "system_ind": "System-derived weather indicators (not advice)",
  "alerts": "Official alerts", "alerts_none": "No active official alerts.", "show_on_map": "Show on map",
  "no_voice": "No voice for this language on this device — install it in Windows Settings › Time & language › Speech, or Android › Text-to-speech.",
  "made_by": "Made by",
  "crop.wheat": "Wheat", "crop.paddy": "Rice (paddy)", "crop.cotton": "Cotton", "crop.groundnut": "Groundnut", "crop.castor": "Castor",
  "crop.bajra": "Pearl millet (bajra)", "crop.cumin": "Cumin", "crop.mustard": "Mustard",
  "st.sowing": "Sowing", "st.nursery": "Nursery", "st.transplanting": "Transplanting", "st.vegetative": "Vegetative", "st.squaring": "Squaring",
  "st.flowering": "Flowering", "st.pegging": "Pegging", "st.grain_fill": "Grain filling", "st.pod_fill": "Pod filling",
  "st.boll_development": "Boll development", "st.capsule_development": "Capsule development", "st.seed_development": "Seed development", "st.harvest": "Harvest",
  // speech templates
  "s.today": "{place}. Today maximum {tmax} degrees, minimum {tmin} degrees.",
  "s.pop": "Chance of rain today {pop} percent.",
  "s.rain_week": "Expected rain in the next seven days: {rain} millimetres.",
  "s.dry_week": "No rain expected in the next seven days.",
  "s.risks": "Be careful: {items}.",
  "s.safe": "No major weather danger in the next seven days.",
  "s.spray": "Good days for spraying: {days}.",
  "s.official": "Government warnings are active for your area. Please follow them.",
  "s.advice": "For farm decisions, also follow the official agro-advisory from the Krishi Vigyan Kendra.",
};

const hi: Dict = {
  "mode.citizen": "मेरा मौसम", "mode.farmer": "किसान", "mode.government": "सरकार", "mode.map": "नक्शा",
  "search": "शहर, तालुका या गाँव खोजें…", "gps": "मेरा स्थान",
  "know": "आपको क्या जानना चाहिए", "no_risk": "अगले 7 दिनों में मौसम का कोई बड़ा खतरा नहीं।",
  "feels": "महसूस", "today": "आज", "humidity": "नमी", "wind": "हवा", "rain": "बारिश", "temp": "तापमान",
  "official_warnings": "सरकारी चेतावनी", "risks": "खतरा और असर — अगले 7 दिन", "next48": "अगले 48 घंटे",
  "next10": "अगले 10 दिन", "vs_normal": "सामान्य से तुलना",
  "l0": "कोई खतरा नहीं", "l1": "सावधान", "l2": "चेतावनी", "l3": "गंभीर",
  "r.heat": "लू / गर्मी", "r.cold": "ठंड", "r.rain": "भारी बारिश", "r.wind": "तेज़ हवा", "r.thunderstorm": "आंधी-तूफ़ान",
  "r.lightning": "बिजली गिरना", "r.flood": "बाढ़", "r.drought": "सूखा", "r.fog": "कोहरा", "r.fire": "आग का खतरा", "r.cyclone": "चक्रवात",
  "your_field": "आपका खेत", "state": "राज्य", "district": "ज़िला", "taluka": "तालुका / गाँव", "crop": "फसल", "stage": "फसल की अवस्था",
  "listen": "सुनें", "stop": "रोकें", "simple": "आसान दृश्य", "detailed": "विस्तृत दृश्य",
  "week": "इस हफ्ते आपके खेत का मौसम", "spray_ok": "छिड़काव के लिए ठीक", "dry_day": "सूखा दिन",
  "official_adv": "सरकारी कृषि सलाह", "system_ind": "सिस्टम द्वारा गणना किए गए मौसम संकेत (सलाह नहीं)",
  "alerts": "सरकारी चेतावनियाँ", "alerts_none": "अभी कोई सरकारी चेतावनी नहीं।", "show_on_map": "नक्शे पर दिखाएँ",
  "no_voice": "इस डिवाइस पर इस भाषा की आवाज़ नहीं है — Windows सेटिंग › समय और भाषा › स्पीच में इंस्टॉल करें।",
  "made_by": "निर्माता",
  "crop.wheat": "गेहूँ", "crop.paddy": "धान", "crop.cotton": "कपास", "crop.groundnut": "मूंगफली", "crop.castor": "अरंडी",
  "crop.bajra": "बाजरा", "crop.cumin": "जीरा", "crop.mustard": "सरसों",
  "st.sowing": "बुवाई", "st.nursery": "नर्सरी", "st.transplanting": "रोपाई", "st.vegetative": "बढ़वार", "st.squaring": "कली बनना",
  "st.flowering": "फूल आना", "st.pegging": "सुई बनना", "st.grain_fill": "दाना भरना", "st.pod_fill": "फली भरना",
  "st.boll_development": "टिंडा बनना", "st.capsule_development": "फल बनना", "st.seed_development": "बीज बनना", "st.harvest": "कटाई",
  "s.today": "{place}। आज अधिकतम तापमान {tmax} डिग्री, न्यूनतम {tmin} डिग्री।",
  "s.pop": "आज बारिश की संभावना {pop} प्रतिशत।",
  "s.rain_week": "अगले सात दिनों में {rain} मिलीमीटर बारिश का अनुमान।",
  "s.dry_week": "अगले सात दिनों में बारिश की संभावना नहीं।",
  "s.risks": "सावधान रहें: {items}।",
  "s.safe": "अगले सात दिनों में मौसम का कोई बड़ा खतरा नहीं।",
  "s.spray": "छिड़काव के लिए अच्छे दिन: {days}।",
  "s.official": "आपके क्षेत्र के लिए सरकारी चेतावनी जारी है। कृपया उसका पालन करें।",
  "s.advice": "खेती के फैसलों के लिए कृषि विज्ञान केंद्र की सरकारी कृषि सलाह भी मानें।",
};

const gu: Dict = {
  "mode.citizen": "મારું હવામાન", "mode.farmer": "ખેડૂત", "mode.government": "સરકાર", "mode.map": "નકશો",
  "search": "શહેર, તાલુકો કે ગામ શોધો…", "gps": "મારું સ્થાન",
  "know": "તમારે શું જાણવું જોઈએ", "no_risk": "આગામી 7 દિવસમાં હવામાનનો કોઈ મોટો ખતરો નથી.",
  "feels": "અનુભવ", "today": "આજે", "humidity": "ભેજ", "wind": "પવન", "rain": "વરસાદ", "temp": "તાપમાન",
  "official_warnings": "સરકારી ચેતવણી", "risks": "ખતરો અને અસર — આગામી 7 દિવસ", "next48": "આગામી 48 કલાક",
  "next10": "આગામી 10 દિવસ", "vs_normal": "સામાન્ય સાથે સરખામણી",
  "l0": "કોઈ ખતરો નથી", "l1": "સાવધાન", "l2": "ચેતવણી", "l3": "ગંભીર",
  "r.heat": "લૂ / ગરમી", "r.cold": "ઠંડી", "r.rain": "ભારે વરસાદ", "r.wind": "તેજ પવન", "r.thunderstorm": "વાવાઝોડું",
  "r.lightning": "વીજળી પડવી", "r.flood": "પૂર", "r.drought": "સૂકો ગાળો", "r.fog": "ધુમ્મસ", "r.fire": "આગનો ખતરો", "r.cyclone": "ચક્રવાત",
  "your_field": "તમારું ખેતર", "state": "રાજ્ય", "district": "જિલ્લો", "taluka": "તાલુકો / ગામ", "crop": "પાક", "stage": "પાકની અવસ્થા",
  "listen": "સાંભળો", "stop": "બંધ કરો", "simple": "સરળ દેખાવ", "detailed": "વિગતવાર દેખાવ",
  "week": "આ અઠવાડિયે તમારા ખેતરનું હવામાન", "spray_ok": "છંટકાવ માટે યોગ્ય", "dry_day": "કોરો દિવસ",
  "official_adv": "સરકારી કૃષિ સલાહ", "system_ind": "સિસ્ટમ દ્વારા ગણાયેલા હવામાન સંકેત (સલાહ નથી)",
  "alerts": "સરકારી ચેતવણીઓ", "alerts_none": "હાલમાં કોઈ સરકારી ચેતવણી નથી.", "show_on_map": "નકશા પર બતાવો",
  "no_voice": "આ ઉપકરણ પર આ ભાષાનો અવાજ નથી — Windows સેટિંગ્સ › સમય અને ભાષા › સ્પીચમાં ઇન્સ્ટોલ કરો.",
  "made_by": "નિર્માતા",
  "crop.wheat": "ઘઉં", "crop.paddy": "ડાંગર", "crop.cotton": "કપાસ", "crop.groundnut": "મગફળી", "crop.castor": "દિવેલા",
  "crop.bajra": "બાજરી", "crop.cumin": "જીરું", "crop.mustard": "રાયડો",
  "st.sowing": "વાવણી", "st.nursery": "ધરુવાડિયું", "st.transplanting": "રોપણી", "st.vegetative": "વૃદ્ધિ", "st.squaring": "ચાપવા બેસવા",
  "st.flowering": "ફૂલ આવવા", "st.pegging": "સૂયા બેસવા", "st.grain_fill": "દાણા ભરાવા", "st.pod_fill": "શીંગ ભરાવી",
  "st.boll_development": "જીંડવા બેસવા", "st.capsule_development": "ફળ બેસવા", "st.seed_development": "બીજ બેસવા", "st.harvest": "કાપણી",
  "s.today": "{place}. આજે મહત્તમ તાપમાન {tmax} ડિગ્રી, લઘુત્તમ {tmin} ડિગ્રી.",
  "s.pop": "આજે વરસાદની શક્યતા {pop} ટકા.",
  "s.rain_week": "આગામી સાત દિવસમાં {rain} મિલીમીટર વરસાદનો અંદાજ.",
  "s.dry_week": "આગામી સાત દિવસમાં વરસાદની શક્યતા નથી.",
  "s.risks": "સાવધાન રહો: {items}.",
  "s.safe": "આગામી સાત દિવસમાં હવામાનનો કોઈ મોટો ખતરો નથી.",
  "s.spray": "છંટકાવ માટે સારા દિવસો: {days}.",
  "s.official": "તમારા વિસ્તાર માટે સરકારી ચેતવણી જાહેર છે. કૃપા કરીને તેનું પાલન કરો.",
  "s.advice": "ખેતીના નિર્ણયો માટે કૃષિ વિજ્ઞાન કેન્દ્રની સરકારી કૃષિ સલાહ પણ અનુસરો.",
};

const mr: Dict = {
  "mode.citizen": "माझे हवामान", "mode.farmer": "शेतकरी", "mode.government": "शासन", "mode.map": "नकाशा",
  "search": "शहर, तालुका किंवा गाव शोधा…", "gps": "माझे ठिकाण",
  "know": "तुम्हाला काय माहित असावे", "no_risk": "पुढील 7 दिवसांत हवामानाचा मोठा धोका नाही.",
  "today": "आज", "humidity": "आर्द्रता", "wind": "वारा", "rain": "पाऊस", "temp": "तापमान",
  "official_warnings": "शासकीय इशारे", "risks": "धोका व परिणाम — पुढील 7 दिवस",
  "l0": "धोका नाही", "l1": "सावध", "l2": "इशारा", "l3": "गंभीर",
  "r.heat": "उष्णतेची लाट", "r.cold": "थंडी", "r.rain": "मुसळधार पाऊस", "r.wind": "जोरदार वारा", "r.thunderstorm": "वादळ",
  "r.lightning": "वीज पडणे", "r.flood": "पूर", "r.drought": "कोरडा काळ", "r.fog": "धुके", "r.fire": "आगीचा धोका", "r.cyclone": "चक्रीवादळ",
  "your_field": "तुमचे शेत", "state": "राज्य", "district": "जिल्हा", "taluka": "तालुका / गाव", "crop": "पीक", "stage": "पिकाची अवस्था",
  "listen": "ऐका", "stop": "थांबा", "simple": "सोपे दृश्य", "detailed": "सविस्तर दृश्य",
  "week": "या आठवड्यातील तुमच्या शेताचे हवामान", "spray_ok": "फवारणीसाठी योग्य", "dry_day": "कोरडा दिवस",
  "official_adv": "शासकीय कृषी सल्ला", "alerts": "शासकीय इशारे", "made_by": "निर्माता",
  "crop.wheat": "गहू", "crop.paddy": "भात", "crop.cotton": "कापूस", "crop.groundnut": "भुईमूग", "crop.castor": "एरंड",
  "crop.bajra": "बाजरी", "crop.cumin": "जिरे", "crop.mustard": "मोहरी",
  "st.sowing": "पेरणी", "st.flowering": "फुलोरा", "st.harvest": "काढणी", "st.vegetative": "वाढ",
  "s.today": "{place}. आज कमाल तापमान {tmax} अंश, किमान {tmin} अंश.",
  "s.pop": "आज पावसाची शक्यता {pop} टक्के.",
  "s.rain_week": "पुढील सात दिवसांत {rain} मिलिमीटर पावसाचा अंदाज.",
  "s.dry_week": "पुढील सात दिवसांत पावसाची शक्यता नाही.",
  "s.risks": "सावध राहा: {items}.", "s.safe": "पुढील सात दिवसांत हवामानाचा मोठा धोका नाही.",
  "s.spray": "फवारणीसाठी चांगले दिवस: {days}.",
  "s.official": "तुमच्या भागासाठी शासकीय इशारा जारी आहे. कृपया त्याचे पालन करा.",
  "s.advice": "शेतीच्या निर्णयांसाठी कृषी विज्ञान केंद्राचा शासकीय कृषी सल्ला पाळा.",
};

const pa: Dict = {
  "mode.citizen": "ਮੇਰਾ ਮੌਸਮ", "mode.farmer": "ਕਿਸਾਨ", "mode.government": "ਸਰਕਾਰ", "mode.map": "ਨਕਸ਼ਾ",
  "search": "ਸ਼ਹਿਰ, ਤਹਿਸੀਲ ਜਾਂ ਪਿੰਡ ਲੱਭੋ…", "today": "ਅੱਜ", "rain": "ਮੀਂਹ", "wind": "ਹਵਾ", "humidity": "ਨਮੀ",
  "know": "ਤੁਹਾਨੂੰ ਕੀ ਪਤਾ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ", "no_risk": "ਅਗਲੇ 7 ਦਿਨਾਂ ਵਿੱਚ ਮੌਸਮ ਦਾ ਕੋਈ ਵੱਡਾ ਖ਼ਤਰਾ ਨਹੀਂ।",
  "l0": "ਕੋਈ ਖ਼ਤਰਾ ਨਹੀਂ", "l1": "ਸਾਵਧਾਨ", "l2": "ਚੇਤਾਵਨੀ", "l3": "ਗੰਭੀਰ",
  "r.heat": "ਲੂ / ਗਰਮੀ", "r.cold": "ਠੰਢ", "r.rain": "ਭਾਰੀ ਮੀਂਹ", "r.wind": "ਤੇਜ਼ ਹਵਾ", "r.thunderstorm": "ਹਨੇਰੀ-ਤੂਫ਼ਾਨ",
  "r.lightning": "ਬਿਜਲੀ ਡਿੱਗਣਾ", "r.flood": "ਹੜ੍ਹ", "r.drought": "ਸੋਕਾ", "r.fog": "ਧੁੰਦ", "r.fire": "ਅੱਗ ਦਾ ਖ਼ਤਰਾ", "r.cyclone": "ਚੱਕਰਵਾਤ",
  "your_field": "ਤੁਹਾਡਾ ਖੇਤ", "crop": "ਫ਼ਸਲ", "stage": "ਫ਼ਸਲ ਦੀ ਅਵਸਥਾ", "listen": "ਸੁਣੋ", "stop": "ਰੋਕੋ",
  "week": "ਇਸ ਹਫ਼ਤੇ ਤੁਹਾਡੇ ਖੇਤ ਦਾ ਮੌਸਮ", "spray_ok": "ਛਿੜਕਾਅ ਲਈ ਠੀਕ", "dry_day": "ਸੁੱਕਾ ਦਿਨ", "made_by": "ਨਿਰਮਾਤਾ",
  "crop.wheat": "ਕਣਕ", "crop.paddy": "ਝੋਨਾ", "crop.cotton": "ਨਰਮਾ / ਕਪਾਹ", "crop.mustard": "ਸਰ੍ਹੋਂ", "crop.bajra": "ਬਾਜਰਾ",
  "s.today": "{place}। ਅੱਜ ਵੱਧ ਤੋਂ ਵੱਧ ਤਾਪਮਾਨ {tmax} ਡਿਗਰੀ, ਘੱਟੋ-ਘੱਟ {tmin} ਡਿਗਰੀ।",
  "s.pop": "ਅੱਜ ਮੀਂਹ ਦੀ ਸੰਭਾਵਨਾ {pop} ਪ੍ਰਤੀਸ਼ਤ।", "s.rain_week": "ਅਗਲੇ ਸੱਤ ਦਿਨਾਂ ਵਿੱਚ {rain} ਮਿਲੀਮੀਟਰ ਮੀਂਹ ਦਾ ਅਨੁਮਾਨ।",
  "s.dry_week": "ਅਗਲੇ ਸੱਤ ਦਿਨਾਂ ਵਿੱਚ ਮੀਂਹ ਦੀ ਸੰਭਾਵਨਾ ਨਹੀਂ।", "s.risks": "ਸਾਵਧਾਨ ਰਹੋ: {items}।",
  "s.safe": "ਅਗਲੇ ਸੱਤ ਦਿਨਾਂ ਵਿੱਚ ਮੌਸਮ ਦਾ ਕੋਈ ਵੱਡਾ ਖ਼ਤਰਾ ਨਹੀਂ।", "s.spray": "ਛਿੜਕਾਅ ਲਈ ਚੰਗੇ ਦਿਨ: {days}।",
  "s.official": "ਤੁਹਾਡੇ ਇਲਾਕੇ ਲਈ ਸਰਕਾਰੀ ਚੇਤਾਵਨੀ ਜਾਰੀ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਉਸ ਦੀ ਪਾਲਣਾ ਕਰੋ।",
  "s.advice": "ਖੇਤੀ ਦੇ ਫ਼ੈਸਲਿਆਂ ਲਈ ਕ੍ਰਿਸ਼ੀ ਵਿਗਿਆਨ ਕੇਂਦਰ ਦੀ ਸਰਕਾਰੀ ਸਲਾਹ ਵੀ ਮੰਨੋ।",
};

const bn: Dict = {
  "mode.citizen": "আমার আবহাওয়া", "mode.farmer": "কৃষক", "mode.government": "সরকার", "mode.map": "মানচিত্র",
  "search": "শহর, ব্লক বা গ্রাম খুঁজুন…", "today": "আজ", "rain": "বৃষ্টি", "wind": "বাতাস", "humidity": "আর্দ্রতা",
  "know": "আপনার যা জানা দরকার", "no_risk": "আগামী ৭ দিনে আবহাওয়ার বড় কোনো বিপদ নেই।",
  "l0": "বিপদ নেই", "l1": "সতর্ক", "l2": "সতর্কবার্তা", "l3": "গুরুতর",
  "r.heat": "তাপপ্রবাহ", "r.cold": "শৈত্যপ্রবাহ", "r.rain": "ভারী বৃষ্টি", "r.wind": "ঝোড়ো হাওয়া", "r.thunderstorm": "বজ্রঝড়",
  "r.lightning": "বজ্রপাত", "r.flood": "বন্যা", "r.drought": "শুষ্ক সময়", "r.fog": "কুয়াশা", "r.fire": "আগুনের ঝুঁকি", "r.cyclone": "ঘূর্ণিঝড়",
  "your_field": "আপনার জমি", "crop": "ফসল", "stage": "ফসলের অবস্থা", "listen": "শুনুন", "stop": "থামান",
  "week": "এই সপ্তাহে আপনার জমির আবহাওয়া", "spray_ok": "স্প্রে করার উপযুক্ত", "dry_day": "শুকনো দিন", "made_by": "নির্মাতা",
  "crop.paddy": "ধান", "crop.wheat": "গম", "crop.mustard": "সরিষা", "crop.cotton": "তুলা",
  "s.today": "{place}। আজ সর্বোচ্চ তাপমাত্রা {tmax} ডিগ্রি, সর্বনিম্ন {tmin} ডিগ্রি।",
  "s.pop": "আজ বৃষ্টির সম্ভাবনা {pop} শতাংশ।", "s.rain_week": "আগামী সাত দিনে {rain} মিলিমিটার বৃষ্টির সম্ভাবনা।",
  "s.dry_week": "আগামী সাত দিনে বৃষ্টির সম্ভাবনা নেই।", "s.risks": "সতর্ক থাকুন: {items}।",
  "s.safe": "আগামী সাত দিনে আবহাওয়ার বড় কোনো বিপদ নেই।", "s.spray": "স্প্রে করার ভালো দিন: {days}।",
  "s.official": "আপনার এলাকার জন্য সরকারি সতর্কবার্তা জারি আছে। দয়া করে তা মেনে চলুন।",
  "s.advice": "চাষের সিদ্ধান্তের জন্য কৃষি বিজ্ঞান কেন্দ্রের সরকারি পরামর্শও মেনে চলুন।",
};

const ta: Dict = {
  "mode.citizen": "என் வானிலை", "mode.farmer": "விவசாயி", "mode.government": "அரசு", "mode.map": "வரைபடம்",
  "search": "நகரம், வட்டம் அல்லது கிராமம் தேடுக…", "today": "இன்று", "rain": "மழை", "wind": "காற்று", "humidity": "ஈரப்பதம்",
  "know": "நீங்கள் தெரிந்துகொள்ள வேண்டியது", "no_risk": "அடுத்த 7 நாட்களில் பெரிய வானிலை ஆபத்து இல்லை.",
  "l0": "ஆபத்து இல்லை", "l1": "கவனம்", "l2": "எச்சரிக்கை", "l3": "கடுமை",
  "r.heat": "வெப்ப அலை", "r.cold": "குளிர்", "r.rain": "கனமழை", "r.wind": "பலத்த காற்று", "r.thunderstorm": "இடியுடன் கூடிய புயல்",
  "r.lightning": "மின்னல்", "r.flood": "வெள்ளம்", "r.drought": "வறட்சி", "r.fog": "மூடுபனி", "r.fire": "தீ ஆபத்து", "r.cyclone": "புயல்",
  "your_field": "உங்கள் வயல்", "crop": "பயிர்", "stage": "பயிர் நிலை", "listen": "கேளுங்கள்", "stop": "நிறுத்து",
  "week": "இந்த வாரம் உங்கள் வயல் வானிலை", "spray_ok": "தெளிக்க ஏற்றது", "dry_day": "உலர் நாள்", "made_by": "உருவாக்கியவர்",
  "crop.paddy": "நெல்", "crop.groundnut": "நிலக்கடலை", "crop.cotton": "பருத்தி",
  "s.today": "{place}. இன்று அதிகபட்ச வெப்பநிலை {tmax} டிகிரி, குறைந்தபட்சம் {tmin} டிகிரி.",
  "s.pop": "இன்று மழைக்கான வாய்ப்பு {pop} சதவீதம்.", "s.rain_week": "அடுத்த ஏழு நாட்களில் {rain} மில்லிமீட்டர் மழை எதிர்பார்க்கப்படுகிறது.",
  "s.dry_week": "அடுத்த ஏழு நாட்களில் மழை வாய்ப்பு இல்லை.", "s.risks": "கவனமாக இருங்கள்: {items}.",
  "s.safe": "அடுத்த ஏழு நாட்களில் பெரிய வானிலை ஆபத்து இல்லை.", "s.spray": "தெளிக்க நல்ல நாட்கள்: {days}.",
  "s.official": "உங்கள் பகுதிக்கு அரசு எச்சரிக்கை உள்ளது. தயவுசெய்து அதைப் பின்பற்றுங்கள்.",
  "s.advice": "விவசாய முடிவுகளுக்கு வேளாண் அறிவியல் மையத்தின் அரசு ஆலோசனையையும் பின்பற்றுங்கள்.",
};

const te: Dict = {
  "mode.citizen": "నా వాతావరణం", "mode.farmer": "రైతు", "mode.government": "ప్రభుత్వం", "mode.map": "మ్యాప్",
  "search": "నగరం, మండలం లేదా గ్రామం వెతకండి…", "today": "ఈరోజు", "rain": "వర్షం", "wind": "గాలి", "humidity": "తేమ",
  "know": "మీరు తెలుసుకోవలసినది", "no_risk": "రాబోయే 7 రోజుల్లో పెద్ద వాతావరణ ప్రమాదం లేదు.",
  "l0": "ప్రమాదం లేదు", "l1": "జాగ్రత్త", "l2": "హెచ్చరిక", "l3": "తీవ్రం",
  "r.heat": "వడగాలులు", "r.cold": "చలి", "r.rain": "భారీ వర్షం", "r.wind": "బలమైన గాలులు", "r.thunderstorm": "ఉరుములతో తుఫాను",
  "r.lightning": "పిడుగులు", "r.flood": "వరదలు", "r.drought": "పొడి కాలం", "r.fog": "పొగమంచు", "r.fire": "అగ్ని ప్రమాదం", "r.cyclone": "తుఫాను",
  "your_field": "మీ పొలం", "crop": "పంట", "stage": "పంట దశ", "listen": "వినండి", "stop": "ఆపు",
  "week": "ఈ వారం మీ పొలం వాతావరణం", "spray_ok": "పిచికారీకి అనుకూలం", "dry_day": "పొడి రోజు", "made_by": "రూపకర్త",
  "crop.paddy": "వరి", "crop.cotton": "పత్తి", "crop.groundnut": "వేరుశనగ",
  "s.today": "{place}. ఈరోజు గరిష్ఠ ఉష్ణోగ్రత {tmax} డిగ్రీలు, కనిష్ఠం {tmin} డిగ్రీలు.",
  "s.pop": "ఈరోజు వర్షం పడే అవకాశం {pop} శాతం.", "s.rain_week": "రాబోయే ఏడు రోజుల్లో {rain} మిల్లీమీటర్ల వర్షం అంచనా.",
  "s.dry_week": "రాబోయే ఏడు రోజుల్లో వర్షం అవకాశం లేదు.", "s.risks": "జాగ్రత్తగా ఉండండి: {items}.",
  "s.safe": "రాబోయే ఏడు రోజుల్లో పెద్ద వాతావరణ ప్రమాదం లేదు.", "s.spray": "పిచికారీకి మంచి రోజులు: {days}.",
  "s.official": "మీ ప్రాంతానికి ప్రభుత్వ హెచ్చరిక జారీ అయింది. దయచేసి పాటించండి.",
  "s.advice": "వ్యవసాయ నిర్ణయాల కోసం కృషి విజ్ఞాన కేంద్రం ప్రభుత్వ సలహాను కూడా పాటించండి.",
};

const kn: Dict = {
  "mode.citizen": "ನನ್ನ ಹವಾಮಾನ", "mode.farmer": "ರೈತ", "mode.government": "ಸರ್ಕಾರ", "mode.map": "ನಕ್ಷೆ",
  "search": "ನಗರ, ತಾಲ್ಲೂಕು ಅಥವಾ ಗ್ರಾಮ ಹುಡುಕಿ…", "today": "ಇಂದು", "rain": "ಮಳೆ", "wind": "ಗಾಳಿ", "humidity": "ತೇವಾಂಶ",
  "know": "ನೀವು ತಿಳಿಯಬೇಕಾದದ್ದು", "no_risk": "ಮುಂದಿನ 7 ದಿನಗಳಲ್ಲಿ ದೊಡ್ಡ ಹವಾಮಾನ ಅಪಾಯವಿಲ್ಲ.",
  "l0": "ಅಪಾಯವಿಲ್ಲ", "l1": "ಎಚ್ಚರ", "l2": "ಎಚ್ಚರಿಕೆ", "l3": "ತೀವ್ರ",
  "r.heat": "ಬಿಸಿಗಾಳಿ", "r.cold": "ಚಳಿ", "r.rain": "ಭಾರೀ ಮಳೆ", "r.wind": "ಬಲವಾದ ಗಾಳಿ", "r.thunderstorm": "ಗುಡುಗು ಸಹಿತ ಬಿರುಗಾಳಿ",
  "r.lightning": "ಸಿಡಿಲು", "r.flood": "ಪ್ರವಾಹ", "r.drought": "ಒಣ ಅವಧಿ", "r.fog": "ಮಂಜು", "r.fire": "ಬೆಂಕಿ ಅಪಾಯ", "r.cyclone": "ಚಂಡಮಾರುತ",
  "your_field": "ನಿಮ್ಮ ಹೊಲ", "crop": "ಬೆಳೆ", "stage": "ಬೆಳೆ ಹಂತ", "listen": "ಕೇಳಿ", "stop": "ನಿಲ್ಲಿಸಿ",
  "week": "ಈ ವಾರ ನಿಮ್ಮ ಹೊಲದ ಹವಾಮಾನ", "spray_ok": "ಸಿಂಪಡಣೆಗೆ ಸೂಕ್ತ", "dry_day": "ಒಣ ದಿನ", "made_by": "ನಿರ್ಮಾಪಕ",
  "crop.paddy": "ಭತ್ತ", "crop.cotton": "ಹತ್ತಿ", "crop.groundnut": "ಕಡಲೆಕಾಯಿ",
  "s.today": "{place}. ಇಂದು ಗರಿಷ್ಠ ತಾಪಮಾನ {tmax} ಡಿಗ್ರಿ, ಕನಿಷ್ಠ {tmin} ಡಿಗ್ರಿ.",
  "s.pop": "ಇಂದು ಮಳೆಯ ಸಾಧ್ಯತೆ ಶೇಕಡಾ {pop}.", "s.rain_week": "ಮುಂದಿನ ಏಳು ದಿನಗಳಲ್ಲಿ {rain} ಮಿಲಿಮೀಟರ್ ಮಳೆ ನಿರೀಕ್ಷೆ.",
  "s.dry_week": "ಮುಂದಿನ ಏಳು ದಿನಗಳಲ್ಲಿ ಮಳೆಯ ಸಾಧ್ಯತೆ ಇಲ್ಲ.", "s.risks": "ಎಚ್ಚರದಿಂದಿರಿ: {items}.",
  "s.safe": "ಮುಂದಿನ ಏಳು ದಿನಗಳಲ್ಲಿ ದೊಡ್ಡ ಹವಾಮಾನ ಅಪಾಯವಿಲ್ಲ.", "s.spray": "ಸಿಂಪಡಣೆಗೆ ಉತ್ತಮ ದಿನಗಳು: {days}.",
  "s.official": "ನಿಮ್ಮ ಪ್ರದೇಶಕ್ಕೆ ಸರ್ಕಾರಿ ಎಚ್ಚರಿಕೆ ಜಾರಿಯಲ್ಲಿದೆ. ದಯವಿಟ್ಟು ಅದನ್ನು ಪಾಲಿಸಿ.",
  "s.advice": "ಕೃಷಿ ನಿರ್ಧಾರಗಳಿಗೆ ಕೃಷಿ ವಿಜ್ಞಾನ ಕೇಂದ್ರದ ಸರ್ಕಾರಿ ಸಲಹೆಯನ್ನೂ ಪಾಲಿಸಿ.",
};

const ml: Dict = {
  "mode.citizen": "എന്റെ കാലാവസ്ഥ", "mode.farmer": "കർഷകൻ", "mode.government": "സർക്കാർ", "mode.map": "ഭൂപടം",
  "search": "നഗരം, താലൂക്ക് അല്ലെങ്കിൽ ഗ്രാമം തിരയുക…", "today": "ഇന്ന്", "rain": "മഴ", "wind": "കാറ്റ്", "humidity": "ഈർപ്പം",
  "know": "നിങ്ങൾ അറിയേണ്ടത്", "no_risk": "അടുത്ത 7 ദിവസത്തിൽ വലിയ കാലാവസ്ഥാ അപകടമില്ല.",
  "l0": "അപകടമില്ല", "l1": "ജാഗ്രത", "l2": "മുന്നറിയിപ്പ്", "l3": "ഗുരുതരം",
  "r.heat": "ഉഷ്ണതരംഗം", "r.cold": "തണുപ്പ്", "r.rain": "കനത്ത മഴ", "r.wind": "ശക്തമായ കാറ്റ്", "r.thunderstorm": "ഇടിമിന്നലോടുകൂടിയ കൊടുങ്കാറ്റ്",
  "r.lightning": "മിന്നൽ", "r.flood": "വെള്ളപ്പൊക്കം", "r.drought": "വരണ്ട കാലം", "r.fog": "മൂടൽമഞ്ഞ്", "r.fire": "തീപിടിത്ത സാധ്യത", "r.cyclone": "ചുഴലിക്കാറ്റ്",
  "your_field": "നിങ്ങളുടെ കൃഷിയിടം", "crop": "വിള", "stage": "വിളയുടെ ഘട്ടം", "listen": "കേൾക്കുക", "stop": "നിർത്തുക",
  "week": "ഈ ആഴ്ച നിങ്ങളുടെ കൃഷിയിടത്തിലെ കാലാവസ്ഥ", "spray_ok": "തളിക്കാൻ അനുയോജ്യം", "dry_day": "ഉണങ്ങിയ ദിവസം", "made_by": "നിർമ്മാതാവ്",
  "crop.paddy": "നെല്ല്",
  "s.today": "{place}. ഇന്ന് കൂടിയ താപനില {tmax} ഡിഗ്രി, കുറഞ്ഞത് {tmin} ഡിഗ്രി.",
  "s.pop": "ഇന്ന് മഴ സാധ്യത {pop} ശതമാനം.", "s.rain_week": "അടുത്ത ഏഴ് ദിവസത്തിൽ {rain} മില്ലിമീറ്റർ മഴ പ്രതീക്ഷിക്കുന്നു.",
  "s.dry_week": "അടുത്ത ഏഴ് ദിവസത്തിൽ മഴ സാധ്യതയില്ല.", "s.risks": "ശ്രദ്ധിക്കുക: {items}.",
  "s.safe": "അടുത്ത ഏഴ് ദിവസത്തിൽ വലിയ കാലാവസ്ഥാ അപകടമില്ല.", "s.spray": "തളിക്കാൻ നല്ല ദിവസങ്ങൾ: {days}.",
  "s.official": "നിങ്ങളുടെ പ്രദേശത്തിന് സർക്കാർ മുന്നറിയിപ്പ് നിലവിലുണ്ട്. ദയവായി പാലിക്കുക.",
  "s.advice": "കൃഷി തീരുമാനങ്ങൾക്ക് കൃഷി വിജ്ഞാന കേന്ദ്രത്തിന്റെ സർക്കാർ ഉപദേശവും പാലിക്കുക.",
};

const or: Dict = {
  "mode.citizen": "ମୋ ପାଣିପାଗ", "mode.farmer": "କୃଷକ", "mode.government": "ସରକାର", "mode.map": "ମାନଚିତ୍ର",
  "search": "ସହର, ବ୍ଲକ କିମ୍ବା ଗାଁ ଖୋଜନ୍ତୁ…", "today": "ଆଜି", "rain": "ବର୍ଷା", "wind": "ପବନ", "humidity": "ଆର୍ଦ୍ରତା",
  "know": "ଆପଣ ଜାଣିବା ଦରକାର", "no_risk": "ଆଗାମୀ 7 ଦିନରେ ପାଣିପାଗର କୌଣସି ବଡ଼ ବିପଦ ନାହିଁ।",
  "l0": "ବିପଦ ନାହିଁ", "l1": "ସତର୍କ", "l2": "ଚେତାବନୀ", "l3": "ଗୁରୁତର",
  "r.heat": "ଗ୍ରୀଷ୍ମ ପ୍ରବାହ", "r.cold": "ଶୀତ", "r.rain": "ପ୍ରବଳ ବର୍ଷା", "r.wind": "ପ୍ରବଳ ପବନ", "r.thunderstorm": "ବଜ୍ରଝଡ଼",
  "r.lightning": "ବଜ୍ରପାତ", "r.flood": "ବନ୍ୟା", "r.drought": "ଶୁଖିଲା ସମୟ", "r.fog": "କୁହୁଡ଼ି", "r.fire": "ନିଆଁ ବିପଦ", "r.cyclone": "ବାତ୍ୟା",
  "your_field": "ଆପଣଙ୍କ ଜମି", "crop": "ଫସଲ", "stage": "ଫସଲ ଅବସ୍ଥା", "listen": "ଶୁଣନ୍ତୁ", "stop": "ବନ୍ଦ କରନ୍ତୁ",
  "week": "ଏହି ସପ୍ତାହରେ ଆପଣଙ୍କ ଜମିର ପାଣିପାଗ", "spray_ok": "ସିଞ୍ଚନ ପାଇଁ ଉପଯୁକ୍ତ", "dry_day": "ଶୁଖିଲା ଦିନ", "made_by": "ନିର୍ମାତା",
  "crop.paddy": "ଧାନ",
  "s.today": "{place}। ଆଜି ସର୍ବାଧିକ ତାପମାତ୍ରା {tmax} ଡିଗ୍ରୀ, ସର୍ବନିମ୍ନ {tmin} ଡିଗ୍ରୀ।",
  "s.pop": "ଆଜି ବର୍ଷାର ସମ୍ଭାବନା {pop} ପ୍ରତିଶତ।", "s.rain_week": "ଆଗାମୀ ସାତ ଦିନରେ {rain} ମିଲିମିଟର ବର୍ଷା ଆଶା କରାଯାଉଛି।",
  "s.dry_week": "ଆଗାମୀ ସାତ ଦିନରେ ବର୍ଷାର ସମ୍ଭାବନା ନାହିଁ।", "s.risks": "ସତର୍କ ରୁହନ୍ତୁ: {items}।",
  "s.safe": "ଆଗାମୀ ସାତ ଦିନରେ ପାଣିପାଗର କୌଣସି ବଡ଼ ବିପଦ ନାହିଁ।", "s.spray": "ସିଞ୍ଚନ ପାଇଁ ଭଲ ଦିନ: {days}।",
  "s.official": "ଆପଣଙ୍କ ଅଞ୍ଚଳ ପାଇଁ ସରକାରୀ ଚେତାବନୀ ଜାରି ହୋଇଛି। ଦୟାକରି ପାଳନ କରନ୍ତୁ।",
  "s.advice": "ଚାଷ ନିଷ୍ପତ୍ତି ପାଇଁ କୃଷି ବିଜ୍ଞାନ କେନ୍ଦ୍ରର ସରକାରୀ ପରାମର୍ଶ ମଧ୍ୟ ମାନନ୍ତୁ।",
};

const DICTS: Record<Lang, Dict> = { en, hi, gu, mr, pa, bn, ta, te, kn, ml, or };

/** Translate; falls back to English for strings not yet translated in a language. */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = DICTS[lang]?.[key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function useT() {
  const lang = useApp((s) => s.lang);
  return (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
}

export const bcp = (lang: Lang) => LANGS.find((l) => l.id === lang)?.bcp ?? "en-IN";

export const dayName = (lang: Lang, isoDate: string, long = false) =>
  new Date(isoDate + "T12:00:00+05:30").toLocaleDateString(bcp(lang), { weekday: long ? "long" : "short", timeZone: "Asia/Kolkata" });

// ---------------- Text-to-speech ----------------
let voicesCache: SpeechSynthesisVoice[] = [];
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  const load = () => (voicesCache = window.speechSynthesis.getVoices());
  load();
  window.speechSynthesis.onvoiceschanged = load;
}

export function voiceFor(lang: Lang): SpeechSynthesisVoice | undefined {
  const code = bcp(lang).toLowerCase();
  const base = code.split("-")[0];
  return voicesCache.find((v) => v.lang.toLowerCase().replace("_", "-") === code) ?? voicesCache.find((v) => v.lang.toLowerCase().startsWith(base));
}

/** Speak text; returns false when the device has no voice for the language. */
export function speak(lang: Lang, text: string, onEnd?: () => void): boolean {
  if (!("speechSynthesis" in window)) return false;
  const v = voiceFor(lang);
  if (!v && lang !== "en") return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = bcp(lang);
  if (v) u.voice = v;
  u.rate = 0.9;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
  return true;
}

export const stopSpeaking = () => "speechSynthesis" in window && window.speechSynthesis.cancel();
