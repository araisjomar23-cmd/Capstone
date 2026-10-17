// Region XI (Davao Region) Address Data
// Source: Philippine Statistics Authority PSGC / Wikipedia
// Structure: REGION11_DATA[provinceName][cityOrMunicipality] = [barangay, ...]

const REGION11_DATA: Record<string, Record<string, string[]>> = {

  /* ══════════════════════════════════════════════════════════════
     DAVAO CITY  (Highly Urbanized City — independent of province)
  ══════════════════════════════════════════════════════════════ */
  "Davao City": {
    "Davao City": [
      "1-A","2-A","3-A","4-A","5-A","6-A","7-A","8-A","9-A","10-A",
      "11-B","12-B","13-B","14-B","15-B","16-B","17-B","18-B","19-B","20-B",
      "21-C","22-C","23-C","24-C","25-C","26-C","27-C","28-C","29-C","30-C",
      "31-D","32-D","33-D","34-D","35-D","36-D","37-D","38-D","39-D","40-D",
      "Acacia","Agdao Proper","Alfonso Angliongto Sr.","Angliongto",
      "Bago Aplaya","Bago Gallera","Bago Oshiro","Baliok",
      "Batia","Bayabas","Biao Escuela","Biao Guianga","Biao Joaquin",
      "Binugao","Bucana","Buhangin Proper","Bunawan Proper",
      "Cabantian","Cadalian","Calinan Proper","Callawa",
      "Catalunan Grande","Catalunan Pequeño","Centro (San Juan)","Communal",
      "Crossing Bayabas","Dacudao","Dalag","Daliaon Plantation",
      "Dumoy","Eden","Fatima (Ula)","Gov. Paciano Bangoy",
      "Gov. Vicente Duterte","Gumalang","Indangan","Kap. Tomas Monteverde Sr.",
      "Lacson","Langub","Lasang","Leon Garcia Sr.",
      "Lizada","Los Amigos","Lubogan","Lumiad",
      "Ma-a","Mabuhay","Malagos","Malamba","Manambulan",
      "Mandug","Manuel Guianga","Mapula","Marapangi",
      "Marilog Proper","Matina Aplaya","Matina Crossing","Matina Pangi",
      "Mintal","Mudiang","Mulig",
      "New Carmen","New Valencia",
      "Panacan","Pampanga","Pangyan","Paradise Embak",
      "Rafael Castillo","Riverside","Salapawan","Salaysay",
      "Saloy","San Antonio","Santo Niño","Sasa","Sirib",
      "Sirawan","Sirib","Suawan (Tuli)","Subasta",
      "Tagakpan","Tagluno","Tagurano","Talomo Proper",
      "Tamugan","Tapak","Tawan-tawan","Tibungco",
      "Tigatto","Toril Proper","Tugbok Proper","Turno",
      "Ula","Waan","Wangan","Wines"
    ]
  },

  /* ══════════════════════════════════════════════════════════════
     DAVAO DEL NORTE
  ══════════════════════════════════════════════════════════════ */
  "Davao del Norte": {

    "Panabo City": [
      "A. O. Floirendo","Buenavista","Cacao","Cagangohan",
      "Consolacion","Dapco","Datu Abdul Dadia","Gredu (Pob.)",
      "J.P. Laurel","Kasilak","Katipunan","Katualan",
      "Kauswagan","Kiotoy","Little Panay","Lower Panaga (Roxas)",
      "Mabunao","Maduao","Malativas","Manay",
      "Nanyo","New Malaga (Dalisay)","New Malitbog","New Pandan (Pob.)",
      "New Visayas","Quezon","Salvacion","San Francisco (Pob.)",
      "San Nicolas","San Pedro","San Roque","San Vicente",
      "Santa Cruz","Santo Niño (Pob.)","Sindaton","Southern Davao",
      "Tagpore","Tibungol","Upper Licanan","Waterfall"
    ],

    "Tagum City": [
      "Apokon","Bincungan","Busaon","Canocotan",
      "Cuambogan","La Filipina","Liboganon","Madaum",
      "Magdum","Magugpo East","Magugpo North","Magugpo Poblacion",
      "Magugpo South","Magugpo West","Mankilam","New Balamban",
      "Nueva Fuerza","Pagsabangan","Pandapan","San Agustin",
      "San Isidro","Visayan Village","Hijo"
    ],

    "Island Garden City of Samal": [
      "Adecor","Anonang Mayor","Anonang Menor","Balet",
      "Caliclic","Camudmud","Catagman","Cogon",
      "Tagbaobo","Babak Poblacion","Camudmud","Kanaan",
      "Limao","Linosutan","Mabini","Miranda",
      "Pangubatan","Peñaplata (Pob.)","Samal","San Antonio",
      "San Isidro (Panacan)","San Jose","San Remigio","Santa Cruz",
      "Santo Niño","Tagdaliao","Tambo","Toril"
    ],

    "Asuncion (Saug)": [
      "Babag","Bincungan","Buclad","Caw-aw",
      "Doña Andrea","Filit","Kingking","Magatos",
      "Manuel Peralta","New Calape","New Katipunan","New Murcia",
      "New Visayas","Paiton","Poblacion","San Antonio",
      "San Marcos","San Pedro","Sonlon"
    ],

    "Braulio E. Dujali": [
      "Cabayangan","Dujali","Magupising","New Casay",
      "Rizal"
    ],

    "Carmen": [
      "Alejal","Amacan","Ambago","Anahaw",
      "Anibongan","Anticala","Aumbay","Bao",
      "Bayaoas","Bincungan","Bucod","Bulatukan",
      "Cebulano","Dorot","Dulian","Dungguan",
      "Gupitan","Hijo","Imelda","Imok",
      "La Suerte","Libudon","Luban","Magcagong",
      "Magsaysay","Mamacao","Matiao","Mawab",
      "Mesaoy","Minda","Ngan","New Asturias",
      "New Barili","New Bohol","New Leyte","New Visayas",
      "New Albay","Panansalan","Paquibato","Poblacion",
      "San Isidro","San Miguel","San Pedro","Santa Cruz",
      "Santo Niño","Sinawilan","Sirib","Tuganay","Ula"
    ],

    "Kapalong": [
      "Capungagan","Florida","Gabuyan","Gupitan",
      "Katipunan","La Paz","Mabuhay","Maniki (Pob.)",
      "Minda","New Bohol","New Cebu","New Leyte",
      "New Visayas","Pag-asa","San Isidro","San Miguel",
      "Santo Niño","Tupa","Ula"
    ],

    "New Corella": [
      "Cabidianan","Carcor","Del Pilar","Kidanao",
      "Lino","Macagtas","New Bohol","New Cortez",
      "New Sambog","Patrocinio","Poblacion","San Roque",
      "Santa Filomena","Santo Niño","Sinawilan","Surigao del Norte",
      "Talomo"
    ],

    "Santo Tomas": [
      "Balnate","Bantaos","Binuangan","Bobong",
      "Braulio E. Dujali","Campalanas","Cebulano","Conel",
      "Corpuz","Datu Balong","Ising","Langa-an",
      "Maniki","Mogocboc","Ogan","Pichon",
      "Poblacion","San Isidro","Tacul","Tigatto"
    ],

    "Sawata": [
      "Bincungan","Crossing","Gupitan","Linoan",
      "Mahayahay","Malinao","Mapula","New Asturias",
      "New Leyte","Poblacion","San Vicente","Santo Niño"
    ],

    "Talaingod": [
      "Dagohoy","Palma Gil","Talaingod Poblacion"
    ]
  },

  /* ══════════════════════════════════════════════════════════════
     DAVAO DEL SUR
  ══════════════════════════════════════════════════════════════ */
  "Davao del Sur": {

    "Digos City": [
      "Aplaya","Balabag","Binaton","Cogon",
      "Colorado","Dawis","Dulangan","Goma",
      "Igpit","Kapatagan","Kiagot","Lungag",
      "Mahayag","Manuel Peralta","New Bohol","New Israel",
      "New Pandan","Nilogan","Padre Sergio Osmeña Sr.","Palili",
      "Pampanga","Pandaitan","Pangyan","Ruparan",
      "San Agustin","San Jose (Balutakay)","San Miguel (Odaca)","San Roque",
      "Sinawilan","Soong","Tiguman","Tres de Mayo",
      "Zone I (Pob.)","Zone II (Pob.)","Zone III (Pob.)"
    ],

    "Bansalan": [
      "Alegria","Asbang","Asinan","Bagong Negros",
      "Bagong Silang","Balutakay","Banayal","Bato",
      "Bitaug","Buenavista","Buena Vista","Camanchiles",
      "Cebulano","Crossing Palaris","Darapuay","Dolo",
      "Dominga","Eman","Gupitan","Kinuskusan",
      "Libertad","Lipa","Mabuhay","Maco",
      "Magsaysay","Manuel Peralta","New Clarin (Miral)","Pagalungan",
      "Paligue","Poblacion","Punta Pilar","Rang-ay",
      "Saboy","San Isidro","San Jose","San Miguel",
      "Santa Cruz","Santa Maria","Santo Niño","Sinawilan",
      "Tamlangon","Tibongbong","Tiburcia"
    ],

    "Hagonoy": [
      "Adawe","Anonang","Aringay","Balasinon",
      "Barayong","Baroy","Buyong","Central (Pob.)",
      "Cudal","Dalawinon","Dalipe","Datu Maro",
      "Guihing Proper","Halapitan","Kibuaton","Kitayo",
      "Langgal","La Union","Leling","Licup",
      "Mabuhay","Mahayahay","Matiao","Mipangi",
      "New Cebu","New Iloilo","Palili","Pamansalan",
      "Pinamuno","Poblacion","San Guillermo","Talagutong",
      "Waterfall"
    ],

    "Kiblawan": [
      "Ablayan","Batobato (Pob.)","Calapagan","Cam坂bangan",
      "Cogon","Culaman","Fatima","Idaoman",
      "Kiblawan Proper","Kibongbong","Kimlawis","Kipalbig",
      "Kisulad","Kitayo","Lide","Lombocan",
      "Mabuhay","Maibo","Malinao","Malungon Kibway",
      "Managa","Matutungan","Mintal","Pakeid",
      "Palao","Pamintahan","Pitalo","Poblacion",
      "San Isidro","Santa Cruz","Sindatan","Tamlangon",
      "Tibongbong","Tono-ob"
    ],

    "Magsaysay": [
      "Clib","Colon","Kanapulo","Kibungsod",
      "Kinuskusan","La Union","Lapulabao","Latibon",
      "Libertad","Magsaysay Poblacion","Malaga","Maloy",
      "Nuing","Pañalum","San Isidro","Tagaytay"
    ],

    "Malalag": [
      "Calapagan","Cambanogoy","Colonsabak","Daliao",
      "Davan","Del Pilar","Eastern Poblacion","Goma",
      "Gubatan","Kiblawan","Lapla","Lawa-an",
      "Lipol","Mabuhay","Malangit","Manuel Roxas",
      "New Baclayon","Poblacion","Sagalaran","Tawa"
    ],

    "Matanao": [
      "Asbang","Aslong","Bagumbayan","Balasinon",
      "Balong","Bato","Bilag","Bunot",
      "Cabligan (Managa)","Camudmud","Colongulo","Dalawinon",
      "Datu Celo","Dawhoy","Lolog","Mabuhay",
      "Manuel Peralta","Marcelina","Matanao Poblacion","Mckinley",
      "Mengao","Muñoz","New Murcia","New Visayas",
      "Nituan","Pag-asa","Paligue","Patulul",
      "Poblacion","Saboy","San Isidro","San Jose",
      "Santa Cruz","Santo Niño","Sinawilan","Sundawa",
      "Tologan"
    ],

    "Padada": [
      "Almeria","Balutakay","Bayabas","Binaton",
      "Bito-on","Buayan","Buhangin","Darong",
      "Harada Butay","Kiblawan","Kinuskusan","Libertad",
      "Lorega","Mabuhay","Napungas","New Cebu",
      "Old Bulatukan","Palili","Pasig","Riverside",
      "Sacub","San Isidro North","San Isidro South","Santa Cruz",
      "Santo Niño","Sugal","Talas","Tamlangon",
      "Zone I (Pob.)","Zone II (Pob.)"
    ],

    "Santa Cruz": [
      "Astorga","Balasinon","Barayong","Bato",
      "Binaton","Bolila","Buenavista","Buhangin",
      "Bulacan","Bungabon","Calapagan","Cam坂bangan",
      "Colonsabak","Dalumpinas","Darong","Del Pilar",
      "Gatungan","Guadalupe","Inawayan","José Rizal",
      "Kiblawan","Kinuskusan","Lacaron","Lipa",
      "Mabuhay","Maco","Mahayag","Malinao",
      "Matiao","Matutungan","Nabunturan","Ngan",
      "Nueva Valencia","Nuevo Iloco","Palili","Pamansalan",
      "Pinamuno","Poblacion I (Zone I)","Poblacion II (Zone II)","Sacub",
      "Salamat","San Isidro","San Miguel","Santo Niño",
      "Tagaytay","Talas","Tamlangon","Tibagon",
      "Tibongbong","Tono-ob","Tres de Mayo"
    ],

    "Sulop": [
      "Balasinon","Baluntay","Datu Celo","Katipunan",
      "Kinuskusan","Leling","Libertad","Maibo",
      "Maibo-ob","Malasin","Maligatong","Malungon",
      "Mansanas","Nuevo Iloco","Pag-asa","Palao",
      "Pamansalan","Pangi","Poblacion","Pugi",
      "San Juan","Santa Cruz","Tagaytay","Tubak"
    ]
  },

  /* ══════════════════════════════════════════════════════════════
     DAVAO DE ORO (formerly Compostela Valley)
  ══════════════════════════════════════════════════════════════ */
  "Davao de Oro": {

    "Compostela": [
      "Bagongon","Bantacan","Barrio Nuevo","Basak",
      "Binasbas","Bugbug","Cabadiangan","Calabcab",
      "Concepcion","Cub-ug","Gabi","Genoran",
      "Ilomavis","Ipil","Junction","Lapu-lapu",
      "Magcagong","Magsaysay","Maparat","Ngan",
      "Osmeña","Panansalan","Poblacion","San Jose",
      "Tamia","Ulip"
    ],

    "Laak (San Vicente)": [
      "Agusan","Banbanon","Binasbas","Bulawan",
      "Calabcab","Callawa","Camanlangan","Causwagan",
      "Dalingap","Guinalaban","Ising","La Paz",
      "Laak Poblacion","Liberty","Limbo","Linao",
      "Lower Ulip","Mabuhay","Mabugnao","Maco",
      "Malinao","Manggahan","Maragusan","Marayag",
      "Mauswagon","Napnapan","New Albay","New Alegria",
      "New Leyte","New Visayas","Pangutosan","Panansalan",
      "San Antonio","San Isidro","San Mariano","San Miguel",
      "San Pedro","San Vicente","Sinai","Upper Ulip"
    ],

    "Mabini": [
      "Benigno Aquino Jr.","Bucana","Concepcion",
      "Lacaron","Lorongan","Mabini Poblacion","Magcagong",
      "Mapawa","Maragusan","New Clarin","Pangutosan",
      "San Isidro","San Miguel","San Pedro","Santo Niño"
    ],

    "Maco": [
      "Anibongan","Anislagan","Anitap","Binuangan",
      "Bucana","Calabcab","Camuspan","Elizalde (Somil)",
      "Gubatan","Hijo","Kinuban","Langgam",
      "Lirasan","Lumatab","Magsaysay","Malamodao",
      "Manipongol","Mapaang","Masara","New Asturias",
      "New Barili","New Leyte","New Visayas","Panansalan",
      "Panibasan","Panoraon","Poblacion","San Juan",
      "San Roque","Sangab","Tagbaros","Taguibo",
      "Tamia"
    ],

    "Maragusan (San Mariano)": [
      "Bagong Silang","Bahi","Baylo","Blanco",
      "Coronobe","Dao","Elizalde","Imelda",
      "Katipunan","Lahi","Langtud","Lapu-lapu",
      "Linao","Mabuhay","Magcagong","Magsaysay",
      "Maparat","Maragusan Poblacion","Matosинan","New Albay",
      "New Alegria","New Antique","New Bataan","New Leyte",
      "New Visayas","Paloc","Pamintahan","Pangibiran",
      "Pindasan","Rizal","San Isidro","San Jose",
      "San Miguel","San Vicente","Santiago","Sawangan",
      "Tawagan","Tubo-Tubo","Tupaz","Upper Ulip"
    ],

    "Mawab": [
      "Andap","Anislagan","Anitap","Cabuyao",
      "Cawit","Don Sergio Osmeña Sr.","Lapu-lapu","Libasan",
      "Lumatab","Mabuhay","Maco","Magcagong",
      "Magsaysay","Mamad","Maragusan","Mawab Poblacion",
      "New Leyte","New Visayas","Panibasan","Panoraon",
      "Salug","San Isidro","San Miguel","Sangab"
    ],

    "Monkayo": [
      "Awao","Babag","Banlag","Baylo",
      "Casoon","Haguimitan","Inambatan","Malinao",
      "Monkayo Poblacion","Naboc","Olaycon","One Maco",
      "Panansalan","Pagsabangan","Pascualabog","Pindasan",
      "San Isidro","San Roque","Salvacion","Santiago",
      "Tamia","Tubo-Tubo","Upper Ulip","Urdaneta"
    ],

    "Montevista": [
      "Banlag","Camansi","Cauyonan","Florida",
      "Landero","Magsaysay","Malibago","Manikling",
      "Montevista Poblacion","Nangan","New Leyte","New Visayas",
      "Pagsabangan","San Isidro","San Roque","Santa Filomena",
      "Tagnanan"
    ],

    "Nabunturan": [
      "Anislagan","Anitap","Basak","Binasbas",
      "Buyong","Cebulano","Concepcion","Katipunan",
      "La Libertad","Mabini","Magsaysay","Mainit",
      "Manat","Meybio","Nabunturan Poblacion","New Leyte",
      "New Visayas","Pangutosan","Panansalan","San Isidro",
      "San Jose","San Miguel","Santo Niño","Sua"
    ],

    "New Bataan": [
      "Andap","Bantacan","Batinao","Cabuyao",
      "Camanlangan","Causwagan","Del Pilar","Golden Valley (Idulcos)",
      "Lacson","Lapu-lapu","Libasan","Magsaysay",
      "Manurigao","New Bataan Poblacion","Pamintahan","Pangibiran",
      "San Isidro","San Jose","San Miguel"
    ],

    "Pantukan": [
      "Araibo","Bongabong","Bongbong","Bosi",
      "Kingking","Magnaga","Mamunga","Manuel Roxas",
      "Napnapan North","Napnapan South","New Leyte","Pantukan Poblacion",
      "Tag-ugpo","Tagugpo","Tibagon"
    ]
  },

  /* ══════════════════════════════════════════════════════════════
     DAVAO ORIENTAL
  ══════════════════════════════════════════════════════════════ */
  "Davao Oriental": {

    "Mati City": [
      "Badas","Baganga","Buso","Caburan",
      "Central (Pob.)","Danao","Dawan","Don Enrique Lopez",
      "Don Martin Marundan","Don Salvador Lopez Sr.","Langka","Lawigan",
      "Libudon","Luban","Macambol","Magistral",
      "Matiao","Mayo","Nangan","Panansalan",
      "Pujada","San Isidro","Sainz","Tagabakid",
      "Tagbinonga","Taguibo","Tamisan"
    ],

    "Baganga": [
      "Bobonao","Campawan","Cawayanan","Central (Pob.)",
      "Dapnan","Kinablangan","Lambajon","Manorigao",
      "Masao","None","Panikian","Saoquigue",
      "San Isidro","Saug","Tagabakid","Tagbinonga"
    ],

    "Banaybanay": [
      "Cabangasan","Caganganan","Calubihan","Causwagan",
      "Mahayag","Maputi","Mogbongon","Pag-asa",
      "Poblacion","San Isidro","Sigaboy","Sumaliring","Taytayan"
    ],

    "Boston": [
      "Antequera","Caatihan","Causwagan","Dadong",
      "Jct. Limot","Kiobog","Libudon","Lucod",
      "Magdug","Manuel Roxas","Nangan","Northeast Poblacion",
      "Northwest Poblacion","San Isidro","Southeast Poblacion","Southwest Poblacion"
    ],

    "Caraga": [
      "Alvar","Caningag","Don Aurelio Chicote","Gov. Generoso",
      "Lupon","Magdug","Maputi","Monkayo",
      "Nangan","Pag-asa","Poblacion","San Isidro",
      "San Miguel","Tagboa","Tagugpo"
    ],

    "Cateel": [
      "Abejod","Alegria","Aliwagwag","Aragon",
      "Bago","Baybay (Pob.)","Brillo","Buburon",
      "Caburan","Caningag","Casoon","Colon",
      "Datag","Gubatan","Inspire","Lapu-lapu",
      "Magdug","Nangan","New Visayas","Pag-asa",
      "Poblacion","San Eduardo","San Isidro","San Miguel",
      "Santa Fe","Santiago","Taytayan"
    ],

    "Governor Generoso": [
      "Alubijid","Balet","Banaybanay","Bato",
      "Caburan","Cagdianao","Compotela","Dahican",
      "Don Martin Marundan","Don Salvador Lopez Sr.","Governor Generoso Pob.","Kinablangan",
      "Lambajon","Mabini","Malapag","Mangrove",
      "Mapagba","Mascariñas","Mogbongon","Monserrat",
      "Ngan","None","Pag-asa","Pichon",
      "San Isidro","San Pedro","Santa Cruz","Sigaboy",
      "Taytayan","Tubaon"
    ],

    "Lupon": [
      "Bagong Minglanilla","Bagumbayan","Calapagan","Don Mariano Marcos",
      "Ilangay","Lambajon","Lantawan","Limbahan",
      "Lupon Poblacion","Macangao","Mahayag","Malalag",
      "Malinao","Manikling","Maputi","Matiao",
      "Mulanay","Poblacion","San Isidro","San Mariano",
      "San Pedro","Santa Cruz","Tagboa","Taguibo"
    ],

    "Manay": [
      "Capasnan","Cayawan","Central (Pob.)","Cinco",
      "Dapnan","Don Manuel Roxas","Guza","B. Raquiza",
      "La Union","Mabini","Malinao","Manay Pob.",
      "Manuel Roxas","Mati","Mayo","Napnapan",
      "New Visayas","Ngan","Pag-asa","Pintatagan",
      "Punta","San Isidro","San Pedro","Santa Cruz",
      "Taguibo","Tagugpo","Taocanga","Tidman"
    ],

    "San Isidro": [
      "Anitap","Bago Oshiro","Capalong","Cawayanan",
      "Del Monte","Linoan","Mahayag","Malinao",
      "Manikling","Maputi","Matiao","Mayo",
      "Nangan","New Visayas","Ngan","Pag-asa",
      "Panacan","Poblacion","San Isidro Pob.","San Pedro",
      "Santa Cruz","Taguibo","Tagugpo","Tibagon"
    ],

    "Tarragona": [
      "Cabangasan","Causwagan","La Paz","Limot",
      "Lucod","Magdug","Mahan-ob","Malinao",
      "Mapasoc","Mogbongon","Nangan","New Leyte",
      "Pag-asa","Poblacion","San Isidro","San Pedro",
      "Santa Cruz","Taguibo","Tarragona Proper"
    ]
  },

  /* ══════════════════════════════════════════════════════════════
     DAVAO OCCIDENTAL
  ══════════════════════════════════════════════════════════════ */
  "Davao Occidental": {

    "Malita": [
      "Balasinon","Balete","Balobalo","Banate",
      "Batiano","Bato","Buhangin","Buliok",
      "Culaman","Don Marcelino","Gasi","Ignit",
      "Jose Rizal","Kibalatong","Kiblat","Lacaron",
      "Lagab","Lawa-an","Linadasan","Mabini",
      "Malita Poblacion","Mana","Manuel Roxas","Maribulan",
      "Mudan","New Argao","Pangaleon","Pangian",
      "Pinol","Pisao","Poblacion","Punta Biao",
      "Quibingbing","Sangay","Santo Niño","Talogoy",
      "Timan","Tubalan","Tumalite","Wangan"
    ],

    "Don Marcelino": [
      "Baon","Camalian","Cambuilao","Colorado",
      "Dalupan","Don Marcelino Pob.","Kinanga","La Suerte",
      "Lapuan","Lasado","Linadasan","Mabini",
      "Maguling","Maloh","Manat","Mati",
      "Napnapan","Palili","Quiapo","Salunayan",
      "San Isidro","San Jose","San Miguel","Talagutong",
      "Tiguib"
    ],

    "Jose Abad Santos (Trinidad)": [
      "Balangonan","Buguis","Caburan","Cagdianao",
      "Gumitan","Imo","Kitayo","Lacaron",
      "Lapuan","Lasado","Linadasan","Mabini",
      "Maco","Malinao","Maloh","Napnapan",
      "New Argao","Palili","Planas","Poblacion",
      "Sagpao","San Isidro","San Jose","San Miguel",
      "San Pedro","Tad-awan","Talagutong","Tiguib",
      "Tinago"
    ],

    "Sarangani": [
      "Batiano","Bucana","Buhangin","Camuton",
      "Capalaran","Dalupan","Glan Padidu","Gumasa",
      "Kabatangan","Kiabog","Kiamba","Kinabalan",
      "Lun Padidu","Lun Masla","Mabila","Sarangani Pob.",
      "Taluya","Tinoto"
    ],

    "Santa Maria": [
      "Balasinon","Balobalo","Bantacan","Buhangin",
      "Dalag","Dalupan","Kibao","Lacaron",
      "Lasado","Linadasan","Mabini","Maibo",
      "Malalag","Maloh","Manat","Mapulo",
      "Napnapan","New Argao","Palili","Poblacion",
      "San Isidro","San Jose","Santa Maria Pob.","Tiguib"
    ]
  }
};

export function getProvinces(): string[] {
  return Object.keys(REGION11_DATA).sort();
}

export function getCities(province: string): string[] {
  if (!province || !REGION11_DATA[province]) return [];
  return Object.keys(REGION11_DATA[province]).sort();
}

export function getBarangays(province: string, city: string): string[] {
  if (!province || !city) return [];
  return (REGION11_DATA[province]?.[city] || []).slice().sort();
}