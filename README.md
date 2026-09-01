📦 Almoxarifado

Sistema de gestão e controle de almoxarifado desenvolvido com foco em
simplicidade, operação local e facilidade de uso.

O aplicativo foi projetado para permitir que o almoxarife controle
produtos, estoques, equipes, funcionários, empresas, locais e
movimentações sem depender de uma conexão permanente com a internet.

🚀 Acessar o aplicativo

Acessar o
Almoxarifado

🚧 Projeto em desenvolvimento

O aplicativo está em evolução contínua. Novos recursos, melhorias de
usabilidade e mecanismos de sincronização em nuvem estão sendo
planejados.

✨ Principais características

🏗️ Gestão por projetos

O sistema permite organizar as informações por projeto, mantendo os
dados de cada empreendimento isolados.

Cada projeto possui seus próprios:

Produtos

Empresas

Funcionários

Locais

Equipes

Movimentações

Categorias e unidades de medida são mantidas como informações
compartilhadas.

📦 Controle de produtos

Cadastro e gerenciamento dos materiais utilizados no almoxarifado,
incluindo:

Código

Nome

Descrição

Categoria

Unidade de medida

Marca

Modelo

Estoque mínimo

Status

👥 Funcionários e equipes

Gerenciamento dos funcionários vinculados ao projeto e organização das
equipes.

É possível relacionar:

Funcionários

Funções

Empresas

Encarregados

Equipes

Membros das equipes

🏢 Empresas

Cadastro das empresas relacionadas ao projeto, permitindo organizar
funcionários e movimentações de acordo com suas respectivas empresas.

📍 Locais

Cadastro dos locais utilizados para organização física do estoque e dos
materiais.

Os locais podem possuir uma estrutura hierárquica, permitindo
representar diferentes áreas do empreendimento.

🔄 Movimentações

Registro das movimentações realizadas no almoxarifado, mantendo o
histórico das operações.

Entre as operações disponíveis estão:

Saídas

Ajustes

Transferências

As movimentações podem ser relacionadas a:

Produto

Quantidade

Funcionário

Encarregado

Empresa

Local

Equipe

Data

Observações

📊 Dashboard e consultas

O sistema apresenta informações do estoque e das movimentações de forma
visual, facilitando a consulta e o acompanhamento das operações do
almoxarifado.

📑 Importação e exportação para Excel

O aplicativo possui recursos para trabalhar com planilhas Excel.

É possível utilizar planilhas para:

Importar dados

Exportar projetos

Realizar backups

Restaurar informações

Transferir dados entre ambientes

O formato de planilha utilizado segue uma estrutura organizada para
projetos, categorias, unidades, empresas, funcionários, locais,
produtos, equipes e movimentações.

💾 Backup e restauração

O sistema permite exportar os dados de um projeto para uma planilha e
posteriormente restaurá-los.

A restauração mantém os identificadores dos registros e substitui os
dados daquele projeto pelo conteúdo do backup, sem interferir nos demais
projetos.

Isso permite utilizar o Excel também como uma forma simples de backup e
recuperação dos dados.

⚡ Arquitetura Local-First

Um dos principais objetivos do projeto é permitir que o almoxarifado
continue funcionando mesmo quando a conexão com a internet estiver
limitada ou indisponível.

A aplicação utiliza armazenamento local no navegador através do
IndexedDB, permitindo que os dados operacionais permaneçam
disponíveis no dispositivo.

O conceito é:

Usuário
   ↓
Aplicação Web / PWA
   ↓
IndexedDB
   ↓
Dados locais do projeto

A internet não deve ser um requisito permanente para as operações
básicas do almoxarifado.

📱 Aplicação instalável

O projeto utiliza recursos de PWA (Progressive Web App), permitindo
que navegadores compatíveis ofereçam a instalação da aplicação no
dispositivo.

Isso possibilita utilizar o sistema de maneira semelhante a um
aplicativo instalado, especialmente em celulares e tablets.

🔐 Isolamento dos projetos

Cada projeto possui seus próprios dados operacionais.

Isso significa que, ao trocar de projeto, o sistema não deve misturar:

Produtos

Funcionários

Empresas

Locais

Equipes

Movimentações

Esse isolamento permite que o mesmo aplicativo seja utilizado em
diferentes obras ou empreendimentos mantendo a separação dos dados.

🧩 Estrutura dos dados

PROJETO
├── Empresas
├── Funcionários
├── Locais
├── Produtos
├── Equipes
│   └── Membros
└── Movimentações

Dados compartilhados
├── Categorias
└── Unidades

🛠️ Tecnologias

React

TypeScript

Vite

Tailwind CSS

TanStack Router

Dexie / IndexedDB

PWA

XLSX

Lucide Icons

💻 Executando localmente

Requisitos

Node.js

npm

Instalação

git clone https://github.com/jardelferreira/almoxarifado.git
cd almoxarifado
npm install
npm run dev

Depois, acesse o endereço informado pelo Vite no terminal.

📋 Fluxo de utilização

Criar projeto
      ↓
Cadastrar empresas
      ↓
Cadastrar funcionários
      ↓
Criar equipes
      ↓
Cadastrar locais
      ↓
Cadastrar produtos
      ↓
Registrar movimentações
      ↓
Consultar estoque
      ↓
Exportar / realizar backup

☁️ Sincronização em nuvem

A arquitetura do projeto foi pensada para futuramente permitir
sincronização dos dados locais com um serviço de armazenamento remoto.

Entre as tecnologias planejadas está o Cloudflare R2.

A sincronização em nuvem ainda faz parte do roadmap e não é necessária
para a operação local atual.

A ideia é preservar o conceito local-first, utilizando a nuvem como
mecanismo complementar de sincronização e backup.

🗺️ Roadmap

Gestão de projetos

Isolamento de dados por projeto

Cadastro de produtos

Cadastro de funcionários

Cadastro de empresas

Cadastro de locais

Cadastro de equipes

Registro de movimentações

Armazenamento local

Aplicação instalável / PWA

Importação e exportação de Excel

Backup e restauração de projetos

Sincronização em nuvem

Armazenamento remoto utilizando Cloudflare R2

Controle de versões dos backups

Limitação de sincronizações

Sincronização incremental

Detecção de atualizações disponíveis

Melhorias no controle de estoque

Relatórios adicionais

Melhorias na experiência mobile

🎯 Objetivo do projeto

O objetivo do Almoxarifado é oferecer uma ferramenta simples, prática
e acessível para o controle diário de materiais.

A proposta é evitar a complexidade comum de sistemas corporativos de
gestão e oferecer ao almoxarife uma interface direta para realizar as
tarefas necessárias no dia a dia.

O projeto também busca explorar uma arquitetura local-first,
adequada para ambientes como obras e empreendimentos onde a
conectividade pode ser instável.

🤝 Contribuição

Sugestões, melhorias e contribuições são bem-vindas.

Para acompanhar o desenvolvimento ou propor melhorias, utilize as
ferramentas disponíveis no repositório do projeto.

📄 Licença

A licença do projeto ainda não foi definida.

👨‍💻 Desenvolvedor

Jardel Ferreira

Projeto desenvolvido para estudo, experimentação e aplicação prática de
tecnologias modernas no gerenciamento de almoxarifado.