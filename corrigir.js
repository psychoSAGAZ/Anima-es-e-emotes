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
        await new Promise(r => setTimeout(r, 300)); 
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
        // Silencioso para não poluir o log
    }
    return null;
}

async function getItemsFromID(id) {
    // Tentativa 1: Tenta ler como um Bundle oficial
    try {
        const data = await fetchData(`https://catalog.roproxy.com/v1/bundles/${id}/details`);
        if (data && Array.isArray(data.items)) {
            return data.items.map(i => ({ id: i.id, type: i.type }));
        }
    } catch (e) {
        // Falhou como bundle, segue para a tentativa 2
    }

    // Tentativa 2: Tenta ler como um Asset/Package detalhado
    try {
        const data = await fetchData(`https://catalog.roproxy.com/v1/catalog/items/${id}/details?itemType=Asset`);
        if (data && data.bundledItems) {
            return data.bundledItems.map(i => ({ id: i.id, type: i.type }));
        }
    } catch (e) {
        // Falhou em ambos
    }

    return null;
}

async function corrigirArquivos() {
    log("Iniciando varredura híbrida (Bundle/Asset) de correção...");

    for (const arquivo of arquivos) {
        if (!fs.existsSync(arquivo)) {
            log(`Arquivo ${arquivo} não encontrado, pulando...`);
            continue;
        }

        log(`Analisando arquivo: ${arquivo}...`);
        const fileData = JSON.parse(fs.readFileSync(arquivo, "utf8"));
        const itens = fileData.data || [];
        let corrigidos = 0;

        for (const item of itens) {
            // Se não tem bundledItems ou se está vazio/bugado
            if (!item.bundledItems || Array.isArray(item.bundledItems) || Object.keys(item.bundledItems).length === 0) {
                log(`Tentando corrigir: ${item.name} (ID: ${item.id})`);
                
                try {
                    const componentes = await getItemsFromID(item.id);
                    
                    if (componentes && componentes.length > 0) {
                        const novosBundledItems = {};

                        for (const comp of componentes) {
                            if (comp.id) {
                                const exactType = await getExactAnimType(comp.id);
                                if (exactType && !novosBundledItems[exactType]) {
                                    novosBundledItems[exactType] = comp.id;
                                    log(`   -> [Achou] ${exactType}: ${comp.id}`);
                                }
                            }
                        }

                        if (Object.keys(novosBundledItems).length > 0) {
                            item.bundledItems = novosBundledItems;
                            corrigidos++;
                        } else {
                            log(`   -> [Aviso] Nenhuma animação válida dentro dos itens deste ID.`);
                        }
                    } else {
                        log(`   -> [Erro] O Roblox não retornou nenhum sub-item para o ID ${item.id}`);
                    }
                } catch (error) {
                    log(`   -> Erro crítico no item ${item.name}: ${error.message}`);
                }
                
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (corrigidos > 0) {
            fileData.lastUpdate = new Date().toISOString();
            fs.writeFileSync(arquivo, JSON.stringify(fileData, null, 2), "utf8");
            log(`Fim: ${corrigidos} itens atualizados com sucesso em ${arquivo}.`);
        } else {
            log(`Nenhum item modificado em ${arquivo}.`);
        }
    }
    log("Varredura concluída!");
}

corrigirArquivos();
