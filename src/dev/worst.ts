// TEMPORARY: the worst realistic data, for stress-testing layouts. Remove with the Developer section in Settings.
//
// Every value is something a real person could type (nothing limits these fields): long Portuguese titles and
// whys, a one-letter value, emoji, a pasted link with no spaces, an hour-long unit, counts at exactly 1, a project
// with many steps, a task with a long note. Spread across rows the way real data is, not stacked into one.
import { db } from '../db/db'
import { addCommitment, addPrep, createGoal, createProject, createTask, saveValues, setValueLook } from '../db/repo'
import { setSettings } from '../db/settings'
import { addDays } from '../lib/dates'
import { emptyGoalDraft, type GoalDraft } from '../lib/draft'
import type { DateStr } from '../lib/types'
import { eraseAllData } from '../sync/controller'

export async function loadWorstCaseData(today: DateStr): Promise<void> {
  await eraseAllData()
  await setSettings({ onboarded: true, goalCap: 10 })

  await saveValues([
    { name: 'Saúde física e mental de verdade', description: 'Ter energia para cuidar de quem eu amo sem chegar esgotado no fim do dia' },
    { name: 'X', description: '' },
    { name: '🏃‍♀️ Corrida', description: 'Correr' },
    { name: 'Família', description: 'Estar presente' },
    { name: 'Independência financeira', description: 'Dinheiro e tempo sob controle' },
    { name: 'Carreira internacional em tecnologia', description: 'Trabalhar fora' },
  ])
  const values = await db.values.toArray()
  const v = (name: string) => values.find((x) => x.name === name)!
  await setValueLook(v('Família'), { icon: 'people', color: 'yellow' })

  const goal = (d: Partial<GoalDraft>, start = true) => createGoal({ ...emptyGoalDraft(addDays(today, -21)), ...d } as GoalDraft, { start })
  const rhythm = { checkinType: 'binary' as const, period: 'week' as const, targetValue: '', targetTime: '', comparator: 'gte' as const, unit: '' }

  // A long title and a long why, wrapping in every card.
  await goal({
    title: 'Conseguir a certificação AWS Solutions Architect Professional antes do fim do ano fiscal',
    whyValueId: v('Carreira internacional em tecnologia').id,
    whyText: 'Porque eu quero muito trabalhar fora do Brasil, ganhar em dólar, morar perto do mar com a minha família e nunca mais depender de um chefe que não reconhece o meu trabalho, mesmo quando eu entrego tudo antes do prazo e ainda ajudo o time inteiro.',
    shape: 'rhythm', label: 'estudo para a certificação AWS', measurementDefinition: 'Estudei pelo menos uma hora e meia com o simulado oficial da AWS e anotei os erros', times: 6, period: 'week',
    tolerancePct: 80, targetDate: addDays(today, 200),
    preps: [{ title: 'Deixar o notebook carregado, o caderno aberto e o simulado da semana já baixado na mesa da sala antes de dormir', fireWeekdays: [1, 2, 3, 4, 5, 6, 7], fireTime: '22:30' }],
  })
  // The shortest title, a one-letter value, a one-word why.
  await goal({
    title: 'Ler', whyValueId: v('X').id, whyText: 'Paz.',
    shape: 'rhythm', label: 'ler', measurementDefinition: 'Li', times: 1, period: 'week', tolerancePct: 100,
  })
  // A pasted link with no break opportunities in the why.
  await goal({
    title: 'Correr a Maratona do Rio', whyValueId: v('🏃‍♀️ Corrida').id,
    whyText: 'Plano: https://www.maratonadorio.com.br/inscricoes/2027/planilha-de-treinos-para-iniciantes-42km-versao-final-v3.pdf',
    shape: 'threshold', label: 'quilômetros', measurementDefinition: 'Corri pelo menos 10000 metros', checkinType: 'quantity', period: 'day',
    targetValue: '10000', comparator: 'gte', unit: 'metros percorridos no relógio', tolerancePct: 70,
  })
  // An outcome with several habits, one of them starting later.
  const money = await goal({
    goalKind: 'outcome', title: 'Juntar seis meses de reserva de emergência', whyValueId: v('Independência financeira').id,
    whyText: 'Para dormir tranquilo.', doneWhen: 'Reserva de R$ 48.000,00 aplicada no Tesouro Selic', graceDays: 30, tolerancePct: 75,
    targetDate: addDays(today, 365),
  })
  const moneyGoal = (await db.goals.get(money.id))!
  const spend = await addCommitment(moneyGoal, { ...rhythm, shape: 'rhythm', label: 'registrar gastos', measurementDefinition: 'Registrei todos os gastos do dia na planilha, inclusive o cafezinho', times: 7 }, addDays(today, -21))
  await addPrep(spend.id, { title: 'Anotar', fireWeekdays: [7], fireTime: '20:00' })
  await addCommitment(moneyGoal, { ...rhythm, shape: 'rhythm', label: 'investir', measurementDefinition: 'Transferi', times: 1 }, addDays(today, 30))
  // A value with no picked look, in the backlog.
  await goal({
    title: 'Jantar com a família toda sexta-feira, sem celular na mesa', whyValueId: v('Família').id, whyText: '',
    shape: 'rhythm', label: 'jantar', measurementDefinition: 'Jantamos juntos', times: 1, period: 'week', tolerancePct: 80,
  }, false)

  // Projects: one with many steps and a long name, one with a single step, one with a goal.
  await createProject({
    title: 'Reformar o apartamento inteiro antes do bebê nascer (cozinha, banheiro e quarto)', targetDate: addDays(today, 3),
    steps: [
      'Pedir três orçamentos', 'Escolher o pedreiro', 'Comprar o piso', 'Quebrar o piso antigo da cozinha e do banheiro social',
      'Trocar o encanamento', 'Instalar o piso', 'Pintar', 'Montar o quarto', 'Instalar as luminárias', 'Limpeza pós-obra',
      'Mudar os móveis de volta', 'Chamar a família para conhecer',
    ],
  })
  await createProject({ title: 'IR', targetDate: addDays(today, -40), steps: ['Declarar'] })
  await createProject({
    title: 'Montar o portfólio no GitHub', targetDate: addDays(today, 90), goalId: (await db.goals.toArray()).find((g) => g.title.startsWith('Conseguir'))!.id,
    steps: ['Escolher 3 projetos'],
  })

  // Tasks: a pasted link, a long note, a one-letter title, overdue and timed.
  await createTask({ title: 'Ver https://docs.aws.amazon.com/whitepapers/latest/aws-overview/introduction.html', date: today })
  await createTask({
    title: 'Ligar para o banco e pedir o estorno da cobrança duplicada do cartão de crédito de setembro',
    note: 'Protocolo 2026091812345678. Falar com o setor de contestação, não com o atendimento geral. Ter em mãos a fatura e o comprovante do primeiro pagamento.',
    date: addDays(today, -12), time: '09:30',
  })
  await createTask({ title: 'A', date: today, time: '23:59' })
}
