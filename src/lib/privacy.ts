import type { Lang } from '../i18n'

/**
 * The privacy policy (spec PR-7, PR-8), written for Brazil's LGPD (Lei 13.709/2018): what its art. 9
 * asks a controller to tell, the rights of art. 18, transfers abroad (art. 33), security (art. 46) and
 * incidents (art. 48). The Portuguese text is the one that counts. A change here is a new version:
 * bump POLICY_VERSION and the date, and tell people in the app (section "Changes").
 */
export const POLICY_VERSION = 1
export const POLICY_DATE = '2026-10-29'
export const CONTACT_EMAIL = 'smartmeta.codes@gmail.com'

export interface PolicySection {
  title: string
  /** Paragraphs; a paragraph that is a list holds its items. */
  body: (string | string[])[]
}

export interface Policy {
  title: string
  updated: string
  /** Shown first: the short version. */
  summary: string[]
  sections: PolicySection[]
}

const pt: Policy = {
  title: 'Política de Privacidade',
  updated: `Versão ${POLICY_VERSION}, atualizada em 29 de outubro de 2026.`,
  summary: [
    'Suas metas, check-ins, tarefas, projetos, revisões e notas são criptografados no seu celular antes de sair dele. Eu, que mantenho o app, não consigo ler esse conteúdo.',
    'Eu consigo ver seu e-mail, seu nome, seu avatar e dados técnicos (metadados): quantos registros você tem e de que tipo, quando mudam, o tamanho deles e quando há notificações agendadas.',
    'O app é gratuito, não tem anúncios, não vende dados e não faz perfil de ninguém.',
  ],
  sections: [
    {
      title: '1. Quem é o responsável',
      body: [
        'O Smart Meta é um aplicativo gratuito, sem fins lucrativos, feito e mantido por uma pessoa física: Pedro Henrique Antoine Cortez Daccache, que é o controlador dos dados pessoais tratados pelo app (LGPD, art. 5º, VI).',
        `Contato para qualquer assunto de privacidade: ${CONTACT_EMAIL}.`,
        'Como agente de tratamento de pequeno porte, não há encarregado (DPO) indicado (Resolução CD/ANPD nº 2/2022, art. 11). O e-mail acima é o canal de comunicação com os titulares e com a Autoridade Nacional de Proteção de Dados (ANPD).',
      ],
    },
    {
      title: '2. Quais dados são tratados e para quê',
      body: [
        [
          'Sem conta: tudo o que você cria fica só no seu celular. Eu não recebo nada disso.',
          'Estatísticas de uso anônimas (Vercel Web Analytics): páginas abertas, tipo de aparelho e navegador, país. Sem cookies e sem identificar você. Servem para saber se o app funciona bem.',
          'Conta: seu e-mail e a data do cadastro, para enviar o código de acesso, identificar sua conta, aprovar seu acesso e falar com você quando necessário.',
          'Perfil: o nome e o avatar que você escolhe, para identificar você nos pedidos de acesso e, no futuro, para seus amigos.',
          'Conteúdo: metas, check-ins, tarefas, projetos, preparos, revisões e notas. No servidor ficam apenas criptografados de ponta a ponta. Ficam visíveis só os metadados: tipo e identificador de cada registro, datas de alteração, tamanho e se foi apagado.',
          'Chaves: sua chave de dados guardada já trancada (só abre com sua passkey ou senha de dados) e sua chave pública. A passkey e o Face ID ficam com a Apple ou o Google e no seu aparelho; o app nunca recebe dados biométricos.',
          'Notificações, se você ativar: o endereço de envio fornecido pelo serviço de notificações do seu aparelho (Apple ou Google), seu fuso horário, os horários das notificações planejadas e um registro de envio (horário e resultado) guardado por 30 dias. O texto das notificações é criptografado no seu celular.',
          'Segurança: ao pedir um código, o Cloudflare Turnstile verifica se é uma pessoa (usa o endereço IP e sinais do navegador). O provedor de login registra acessos (endereço IP e horário) para proteger as contas.',
          'Registro de diagnóstico: fica só no seu celular e só sai dele se você mesmo copiar e enviar.',
        ],
      ],
    },
    {
      title: '3. Bases legais',
      body: [
        [
          'Execução de contrato ou de procedimentos pedidos por você (LGPD, art. 7º, V): conta, sincronização, cópia de segurança e as notificações que você ativar.',
          'Legítimo interesse (art. 7º, IX): segurança, prevenção de abuso (captcha, limites de uso, registros de acesso), cópias de segurança e estatísticas anônimas de uso.',
          'Cumprimento de obrigação legal (art. 7º, II): quando uma lei ou autoridade exigir.',
        ],
        'Para usar a sincronização e as notificações é preciso ter uma conta, e para isso é preciso informar um e-mail. Sem conta, o app funciona normalmente, só no seu celular, sem cópia de segurança e sem notificações.',
      ],
    },
    {
      title: '4. Com quem os dados são compartilhados',
      body: [
        'Somente com os fornecedores que fazem o app funcionar, que tratam os dados em meu nome (operadores):',
        [
          'Supabase: banco de dados e login. Os dados ficam em São Paulo, Brasil.',
          'Vercel: hospedagem do app e estatísticas anônimas (Estados Unidos e outros países).',
          'Google: envio dos e-mails com o código (Gmail), passkeys no Android (Gerenciador de Senhas do Google) e entrega de notificações no Android.',
          'Apple: passkeys no iPhone (Chaves do iCloud) e entrega de notificações no iPhone.',
          'Cloudflare: verificação contra robôs (Turnstile).',
          'GitHub: guarda as cópias de segurança, já criptografadas (Estados Unidos).',
        ],
        'Seus dados não são vendidos nem usados para publicidade. Podem ser fornecidos a autoridades quando a lei exigir.',
      ],
    },
    {
      title: '5. Transferência internacional',
      body: [
        'Alguns desses fornecedores ficam ou tratam dados nos Estados Unidos e em outros países. A transferência é necessária para prestar o serviço que você pediu (LGPD, art. 33, IX, combinado com o art. 7º, V), e esses fornecedores adotam garantias contratuais de proteção de dados. O conteúdo das suas metas já sai do seu celular criptografado.',
      ],
    },
    {
      title: '6. Por quanto tempo',
      body: [
        [
          'Enquanto sua conta existir.',
          'Ao excluir a conta (Ajustes, Conta, Excluir conta), sua conta e seus dados no servidor são apagados na hora. As cópias de segurança, criptografadas, expiram em até 35 dias.',
          'Itens que você apaga deixam um marcador sem conteúdo legível por 90 dias, para que seus outros aparelhos saibam que foram apagados.',
          'O registro de envio de notificações é guardado por 30 dias.',
          'No seu celular, os dados ficam até você apagá-los (Ajustes, Apagar todos os dados) ou remover o app.',
        ],
      ],
    },
    {
      title: '7. Segurança',
      body: [
        'O conteúdo é criptografado no seu celular (AES-GCM) com uma chave que só a sua passkey ou a sua senha de dados abre. O banco de dados só deixa cada pessoa ver os próprios registros, só membros aprovados podem gravar, há limites de tamanho e de quantidade, as cópias de segurança são criptografadas e as contas de administração usam verificação em duas etapas. Nenhum sistema é totalmente seguro, mas, mesmo num vazamento, o conteúdo das suas metas continua ilegível.',
        'Por causa da criptografia, se você perder todas as formas de abrir sua chave (a passkey e a senha de dados), eu não consigo recuperar a cópia do servidor. A cópia no seu celular e a exportação em arquivo continuam funcionando.',
      ],
    },
    {
      title: '8. Seus direitos',
      body: [
        'Você pode, a qualquer momento (LGPD, art. 18):',
        [
          'confirmar que seus dados são tratados e acessá-los;',
          'corrigir dados incompletos, errados ou desatualizados;',
          'pedir anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desacordo com a lei;',
          'pedir a portabilidade dos seus dados;',
          'pedir a eliminação dos dados tratados com base no seu consentimento;',
          'saber com quem seus dados são compartilhados;',
          'saber que pode não dar consentimento e o que acontece se não der;',
          'revogar o consentimento.',
        ],
        `Pelo próprio app: corrija nome e avatar em Ajustes, Conta; exporte tudo em Ajustes, Exportar um backup; apague a conta em Ajustes, Conta, Excluir conta. Ou escreva para ${CONTACT_EMAIL} a partir do e-mail da sua conta; a resposta vem em até 15 dias. Como o conteúdo é criptografado, eu não consigo lê-lo para você: a exportação pelo app é o caminho para obtê-lo.`,
        'O app não toma decisões automatizadas sobre você (art. 20). Você também pode reclamar à ANPD (art. 18, § 1º), em gov.br/anpd.',
      ],
    },
    {
      title: '9. Idade mínima',
      body: ['O Smart Meta é destinado a maiores de 18 anos.'],
    },
    {
      title: '10. Cookies e armazenamento no aparelho',
      body: [
        'O app não usa cookies de publicidade nem de rastreamento. Ele guarda seus dados e sua sessão de login no próprio aparelho (armazenamento do navegador) para funcionar, inclusive sem internet.',
      ],
    },
    {
      title: '11. Incidentes',
      body: [
        'Se houver um incidente de segurança que possa causar risco ou dano relevante, as pessoas afetadas e a ANPD serão avisadas (LGPD, art. 48).',
      ],
    },
    {
      title: '12. Alterações',
      body: [
        'Quando esta política mudar, o app avisa e mostra a nova versão. A versão e a data ficam no topo.',
      ],
    },
    {
      title: '13. Lei aplicável',
      body: [
        'Esta política segue a Lei Geral de Proteção de Dados (Lei 13.709/2018) e o Marco Civil da Internet (Lei 12.965/2014). Em caso de diferença entre as versões em português e em inglês, vale a versão em português.',
      ],
    },
  ],
}

const en: Policy = {
  title: 'Privacy Policy',
  updated: `Version ${POLICY_VERSION}, updated 29 October 2026. The Portuguese version is the one that counts.`,
  summary: [
    'Your goals, check-ins, tasks, projects, reviews and notes are encrypted on your phone before they leave it. I, who run the app, can’t read that content.',
    'I can see your email, your name, your avatar and technical data (metadata): how many records you have and of which type, when they change, their size and when notifications are scheduled.',
    'The app is free, has no ads, doesn’t sell data and doesn’t profile anyone.',
  ],
  sections: [
    {
      title: '1. Who is responsible',
      body: [
        'Smart Meta is a free, non-profit app made and run by one person: Pedro Henrique Antoine Cortez Daccache, the controller of the personal data the app processes (LGPD, art. 5, VI).',
        `Contact for anything about privacy: ${CONTACT_EMAIL}.`,
        'As a small processing agent, no data protection officer is appointed (ANPD Resolution 2/2022, art. 11). The email above is the channel for data subjects and for Brazil’s data protection authority (ANPD).',
      ],
    },
    {
      title: '2. What data is processed and why',
      body: [
        [
          'Without an account: everything you create stays on your phone only. I receive none of it.',
          'Anonymous usage statistics (Vercel Web Analytics): pages opened, device and browser type, country. No cookies, and you aren’t identified. They show whether the app works well.',
          'Account: your email and sign-up date, to send your sign-in code, identify your account, approve your access and contact you when needed.',
          'Profile: the name and avatar you pick, to recognize you in access requests and, later, for your friends.',
          'Content: goals, check-ins, tasks, projects, preps, reviews and notes. On the server they are only stored end-to-end encrypted. Only metadata is visible: each record’s type and id, when it changed, its size and whether it was deleted.',
          'Keys: your data key, stored already locked (it only opens with your passkey or data password), and your public key. The passkey and Face ID stay with Apple or Google and on your device; the app never receives biometric data.',
          'Notifications, if you turn them on: the delivery address given by your device’s push service (Apple or Google), your time zone, when planned notifications fire, and a send log (time and result) kept for 30 days. Notification text is encrypted on your phone.',
          'Security: when you ask for a code, Cloudflare Turnstile checks that you’re a person (using your IP address and browser signals). The sign-in provider logs sign-ins (IP address and time) to protect accounts.',
          'Diagnostics log: stays on your phone and only leaves it if you copy and send it yourself.',
        ],
      ],
    },
    {
      title: '3. Legal bases',
      body: [
        [
          'Performing a contract or steps you asked for (LGPD, art. 7, V): account, sync, backup and the notifications you turn on.',
          'Legitimate interest (art. 7, IX): security, abuse prevention (captcha, usage limits, sign-in logs), backups and anonymous usage statistics.',
          'Legal obligation (art. 7, II): when a law or an authority requires it.',
        ],
        'Sync and notifications need an account, and an account needs an email. Without one, the app works as usual, only on your phone, with no backup and no notifications.',
      ],
    },
    {
      title: '4. Who the data is shared with',
      body: [
        'Only the suppliers that make the app work, processing data on my behalf (processors):',
        [
          'Supabase: database and sign-in. Data is stored in São Paulo, Brazil.',
          'Vercel: app hosting and anonymous statistics (United States and other countries).',
          'Google: sending the code emails (Gmail), passkeys on Android (Google Password Manager) and notification delivery on Android.',
          'Apple: passkeys on iPhone (iCloud Keychain) and notification delivery on iPhone.',
          'Cloudflare: bot check (Turnstile).',
          'GitHub: stores the backups, already encrypted (United States).',
        ],
        'Your data is never sold or used for advertising. It may be given to authorities when the law requires it.',
      ],
    },
    {
      title: '5. Transfers abroad',
      body: [
        'Some of these suppliers are in, or process data in, the United States and other countries. The transfer is needed to provide the service you asked for (LGPD, art. 33, IX, with art. 7, V), and these suppliers have contractual data protection safeguards. Your goals’ content already leaves your phone encrypted.',
      ],
    },
    {
      title: '6. How long',
      body: [
        [
          'For as long as your account exists.',
          'When you delete your account (Settings, Account, Delete account), your account and your server data are deleted at once. Backups, encrypted, expire within 35 days.',
          'Items you delete leave a marker with no readable content for 90 days, so your other devices learn they were deleted.',
          'The notification send log is kept for 30 days.',
          'On your phone, data stays until you erase it (Settings, Erase all data) or remove the app.',
        ],
      ],
    },
    {
      title: '7. Security',
      body: [
        'Content is encrypted on your phone (AES-GCM) with a key that only your passkey or data password opens. The database only lets each person see their own records, only approved members can write, there are size and count limits, backups are encrypted, and the admin accounts use two-step verification. No system is perfectly safe, but even in a leak your goals’ content stays unreadable.',
        'Because of the encryption, if you lose every way to open your key (the passkey and the data password), I can’t recover the server copy. The copy on your phone and the file export keep working.',
      ],
    },
    {
      title: '8. Your rights',
      body: [
        'At any time you can (LGPD, art. 18):',
        [
          'confirm that your data is processed, and access it;',
          'correct incomplete, wrong or outdated data;',
          'ask for unnecessary, excessive or unlawfully processed data to be anonymized, blocked or deleted;',
          'ask for your data to be ported;',
          'ask for data processed on the basis of your consent to be deleted;',
          'learn who your data is shared with;',
          'learn that you may refuse consent, and what happens if you do;',
          'withdraw consent.',
        ],
        `In the app: fix your name and avatar in Settings, Account; export everything in Settings, Export a backup; delete your account in Settings, Account, Delete account. Or write to ${CONTACT_EMAIL} from your account’s email; you get an answer within 15 days. Because the content is encrypted, I can’t read it for you: the export in the app is how you get it.`,
        'The app makes no automated decisions about you (art. 20). You can also complain to the ANPD (art. 18, § 1), at gov.br/anpd.',
      ],
    },
    {
      title: '9. Minimum age',
      body: ['Smart Meta is meant for people 18 and older.'],
    },
    {
      title: '10. Cookies and storage on the device',
      body: [
        'The app uses no advertising or tracking cookies. It keeps your data and your sign-in session on the device itself (browser storage) so it works, offline too.',
      ],
    },
    {
      title: '11. Incidents',
      body: [
        'If a security incident could cause relevant risk or harm, the people affected and the ANPD will be told (LGPD, art. 48).',
      ],
    },
    {
      title: '12. Changes',
      body: ['When this policy changes, the app says so and shows the new version. The version and date are at the top.'],
    },
    {
      title: '13. Governing law',
      body: [
        'This policy follows Brazil’s General Data Protection Law (Lei 13.709/2018) and Internet Civil Framework (Lei 12.965/2014). If the Portuguese and English versions differ, the Portuguese one applies.',
      ],
    },
  ],
}

export const policyFor = (lang: Lang): Policy => (lang === 'pt-BR' ? pt : en)
