const https = require("https");
const fs = require("fs");

const arquivos = ["AnimationSniper.json", "AnimationSniperoffsale.json"];

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

async function fetchData(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = "";
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            res.on("data", (chunk) => data += chunk);
            res.on("end", () => {
                try { resolve(JSON.parse(data)); } 
                catch (e) { reject(e); }
            });
        }).on("error", reject);
    });
}

async function getExactAnimType(assetId) {
    try {
        await new Promise(r => setTimeout(r, 250)); // Evita bloqueio da API
        const data = await fetchData(`https://economy.roproxy.com/v2/assets/${assetId}/details`);
        if (data && data.AssetTypeId) {
            switch(data.AssetTypeId) {
                case 48: return "Climb";
                case 50: return "Fall";
                case 51: return "Idle";
                case 52: return "Jump";
                case 53: return "Run";
                case 54: return "Swim";
                case 55: return "Walk";
                case 56: return "Pose";
                default: return null;
            }
        }
    } catch (e) {
        log(`Erro ao buscar ID ${assetId}: ${e.message}`);
    }
    return null;
}

async function corrigirArquivos() {
    log("Iniciando varredura de correção...");

    for (const arquivo of arquivos) {
        if (!fs.existsSync(arquivo)) {
            log(`Arquivo ${arquivo} não encontrado, pulando...`);
            continue;
        }

        log(`Analisando ${arquivo}...`);
        const fileData = JSON.parse(fs.readFileSync(arquivo, "utf8"));
        const itens = fileData.data || [];
        let corrigidos = 0;

        for (const item of itens) {
            // Se o item não tem bundledItems ou se ele veio vazio/em formato de array antigo por erro
            if (!item.bundledItems || Array.isArray(item.bundledItems) || Object.keys(item.bundledItems).length === 0) {
                log(`Corrigindo item incompleto: ${item.name} (ID: ${item.id})`);
                
                try {
                    // Puxa os dados originais do pacote para ver o que tem dentro dele
                    const urlDetails = `https://catalog.roproxy.com/v1/search/items/details?Category=12&Subcategory=38&Keyword=${encodeURIComponent(item.name)}`;
                    const searchRes = await fetchData(urlDetails);
                    const pacoteOriginal = searchRes.data?.find(d => d.id === item.id);

                    if (pacoteOriginal && pacoteOriginal.bundledItems) {
                        const novosBundledItems = {};

                        for (const bundledItem of pacoteOriginal.bundledItems) {
                            if (bundledItem.type === "UserOutfit" || bundledItem.type === "Outfit") continue;

                            if (bundledItem.id) {
                                const exactType = await getExactAnimType(bundledItem.id);
                                if (exactType && !novosBundledItems[exactType]) {
                                    novosBundledItems[exactType] = bundledItem.id;
                                }
                            }
                        }

                        if (Object.keys(novosBundledItems).length > 0) {
                            item.bundledItems = novosBundledItems;
                            corrigidos++;
                        }
                    }
                } catch (error) {
                    log(`Não foi possível corrigir o item ${item.name}: ${error.message}`);
                }
            }
        }

        if (corrigidos > 0) {
            fileData.lastUpdate = new Date().toISOString();
            fs.writeFileSync(arquivo, JSON.stringify(fileData, null, 2), "utf8");
            log(`Sucesso! ${corrigidos} itens foram corrigidos e salvos em ${arquivo}.`);
        } else {
            log(`Nada para corrigir em ${arquivo}.`);
        }
    }
    log("Varredura concluída!");
}

corrigirArquivos();
