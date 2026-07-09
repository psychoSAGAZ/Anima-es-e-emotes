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
        await new Promise(r => setTimeout(r, 400)); 
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
        log(`Erro ao checar tipo do asset ${assetId}: ${e.message}`);
    }
    return null;
}

async function corrigirArquivos() {
    log("Iniciando varredura profunda de correção...");

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
            // Verifica se está sem os dados ou se herdou o formato incorreto antigo
            if (!item.bundledItems || Array.isArray(item.bundledItems) || Object.keys(item.bundledItems).length === 0) {
                log(`Corrigindo de forma precisa: ${item.name} (ID: ${item.id})`);
                
                try {
                    // Usando a API correta de detalhes de Bundle do Roblox via RoProxy
                    const urlDetails = `https://catalog.roproxy.com/v1/bundles/${item.id}/details`;
                    const pacoteDetails = await fetchData(urlDetails);
                    
                    if (pacoteDetails && Array.isArray(pacoteDetails.items)) {
                        const novosBundledItems = {};

                        for (const component of pacoteDetails.items) {
                            if (component.type === "Asset" && component.id) {
                                const exactType = await getExactAnimType(component.id);
                                if (exactType && !novosBundledItems[exactType]) {
                                    novosBundledItems[exactType] = component.id;
                                    log(` -> Encontrado: ${exactType} (ID: ${component.id})`);
                                }
                            }
                        }

                        if (Object.keys(novosBundledItems).length > 0) {
                            item.bundledItems = novosBundledItems;
                            corrigidos++;
                        } else {
                            log(` -> Nenhuma animação encontrada para o ID ${item.id}`);
                        }
                    }
                } catch (error) {
                    log(`Não foi possível corrigir o item ${item.name}: ${error.message}`);
                }
                
                await new Promise(r => setTimeout(r, 1500));
            }
        }

        if (corrigidos > 0) {
            fileData.lastUpdate = new Date().toISOString();
            fs.writeFileSync(arquivo, JSON.stringify(fileData, null, 2), "utf8");
            log(`Sucesso! ${corrigidos} itens foram corrigidos em ${arquivo}.`);
        } else {
            log(`Nada para corrigir em ${arquivo}.`);
        }
    }
    log("Varredura concluída!");
}

corrigirArquivos();
