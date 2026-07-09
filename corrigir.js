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

// Descobre o tipo exato da animação pelo ID do asset interno
async function getExactAnimType(assetId) {
    try {
        await new Promise(r => setTimeout(r, 500)); // Delay seguro de meio segundo por item
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
            // Se não tem bundledItems ou se veio em formato de array/objeto vazio por erro antigo
            if (!item.bundledItems || Array.isArray(item.bundledItems) || Object.keys(item.bundledItems).length === 0) {
                log(`Corrigindo de forma precisa: ${item.name} (ID: ${item.id})`);
                
                try {
                    // Puxa os componentes internos do pacote direto pelo ID dele (sem usar busca por nome)
                    const urlDetails = `https://catalog.roproxy.com/v1/catalog/items/${item.id}/details?itemType=Bundle`;
                    const pacoteDetails = await fetchData(urlDetails);
                    
                    // A API de detalhes de Bundle do Roblox retorna uma propriedade chamada 'productComponents'
                    // Ela lista tudo o que vem dentro do pacote de graça/incluso
                    if (pacoteDetails && pacoteDetails.productComponents) {
                        const novosBundledItems = {};

                        for (const component of pacoteDetails.productComponents) {
                            // Verifica se o ID do asset interno existe
                            if (component.id) {
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
                            log(` -> [Aviso] Nenhuma animação mapeada encontrada dentro do ID ${item.id}`);
                        }
                    }
                } catch (error) {
                    log(`Não foi possível corrigir o item ${item.name}: ${error.message}`);
                }
                
                // Espera 2 segundos entre um pacote e outro para não estressar os servidores do Roblox
                await new Promise(r => setTimeout(r, 2000));
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
    log("Varredura profunda concluída!");
}

corrigirArquivos();
