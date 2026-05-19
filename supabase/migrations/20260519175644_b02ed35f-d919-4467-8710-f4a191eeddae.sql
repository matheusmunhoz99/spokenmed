UPDATE atendimentos SET status_envio='pendente', exportacao_id=NULL, exportado_em=NULL WHERE exportacao_id IS NOT NULL;
UPDATE domicilios   SET status_envio='pendente', exportacao_id=NULL, exportado_em=NULL WHERE exportacao_id IS NOT NULL;
UPDATE pacientes    SET status_envio='pendente', exportacao_id=NULL, exportado_em=NULL WHERE exportacao_id IS NOT NULL;
DELETE FROM esus_exportacoes;

INSERT INTO pacientes (id, nome, cpf, cns, data_nascimento, sexo, nome_mae, raca_cor, nacionalidade,
  cep, logradouro, numero, bairro, cidade, uf, telefone, escolaridade, ativo, status_envio)
VALUES
('a0000000-0000-4000-8000-000000000000','Maria Aparecida Silva','10433218100','200133890838636','1985-03-15','F','Joana Silva','parda','brasileira','27580000','Rua das Acacias','100','Centro','Rio Claro','RJ','24999000000','medio_completo',true,'pendente'),
('a0000000-0000-4000-8000-000000000001','Joao Carlos Souza','94026542327','211615594078161','1978-07-22','M','Antonia Souza','parda','brasileira','27580000','Avenida Brasil','110','Vila Nova','Rio Claro','RJ','24999000001','medio_completo',true,'pendente'),
('a0000000-0000-4000-8000-000000000002','Ana Paula Oliveira','84959310367','213164752553418','1992-11-04','F','Rosa Oliveira','parda','brasileira','27580000','Rua Sete de Setembro','120','Jardim das Flores','Rio Claro','RJ','24999000002','medio_completo',true,'pendente'),
('a0000000-0000-4000-8000-000000000003','Pedro Henrique Santos','28327648357','203056413953761','1965-01-30','M','Maria Santos','parda','brasileira','27580000','Rua das Flores','130','Jardim Botanico','Rio Claro','RJ','24999000003','medio_completo',true,'pendente'),
('a0000000-0000-4000-8000-000000000004','Lucia Helena Costa','24238849663','253287101226916','1990-05-18','F','Cleusa Costa','parda','brasileira','27580000','Avenida Rio Branco','140','Vila Operaria','Rio Claro','RJ','24999000004','medio_completo',true,'pendente'),
('a0000000-0000-4000-8000-000000000005','Carlos Eduardo Lima','69784801850','251462704828141','1972-09-09','M','Sebastiana Lima','parda','brasileira','27580000','Rua Marechal Deodoro','150','Jardim America','Rio Claro','RJ','24999000005','medio_completo',true,'pendente'),
('a0000000-0000-4000-8000-000000000006','Fernanda Cristina Rocha','93252880954','270154303911715','1988-12-25','F','Vera Rocha','parda','brasileira','27580000','Rua dos Ipes','160','Parque das Arvores','Rio Claro','RJ','24999000006','medio_completo',true,'pendente'),
('a0000000-0000-4000-8000-000000000007','Rafael Augusto Pereira','22782489607','183465787133159','1995-06-11','M','Iracema Pereira','parda','brasileira','27580000','Rua Padre Anchieta','170','Vila Sao Jose','Rio Claro','RJ','24999000007','medio_completo',true,'pendente'),
('a0000000-0000-4000-8000-000000000008','Juliana Beatriz Alves','98393010390','105183473829974','1980-08-08','F','Maria Alves','parda','brasileira','27580000','Rua Tiradentes','180','Jardim Primavera','Rio Claro','RJ','24999000008','medio_completo',true,'pendente'),
('a0000000-0000-4000-8000-000000000009','Marcos Vinicius Ribeiro','76311656612','201065133387262','1976-04-14','M','Conceicao Ribeiro','parda','brasileira','27580000','Rua Quinze de Novembro','190','Centro','Rio Claro','RJ','24999000009','medio_completo',true,'pendente')
ON CONFLICT (id) DO UPDATE SET cpf=EXCLUDED.cpf, cns=EXCLUDED.cns, status_envio='pendente', exportacao_id=NULL, exportado_em=NULL;

INSERT INTO domicilios (id, unidade_id, acs_user_id, cnes_unidade, cbo_responsavel, cns_responsavel,
  logradouro, numero, sem_numero, bairro, cep, cidade, uf,
  tipo_imovel, tipo_domicilio, material_paredes, num_comodos, num_moradores,
  abastecimento_agua, agua_consumo, esgoto, destino_lixo, energia_eletrica, localizacao,
  microarea, fora_area, ficha_atualizacao, status_envio, data_cadastro)
VALUES
('d0000000-0000-4000-8000-000000000000','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','ef3f57cc-7ead-4c7c-88c7-1bfd841f6593','6232205','515105','898104332181965','Rua das Acacias','100',false,'Centro','27580000','Rio Claro','RJ','1','1','1',3,2,'1','1','1','1',true,'1','01',false,false,'pendente',CURRENT_DATE),
('d0000000-0000-4000-8000-000000000001','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','ef3f57cc-7ead-4c7c-88c7-1bfd841f6593','6232205','515105','898104332181965','Avenida Brasil','110',false,'Vila Nova','27580000','Rio Claro','RJ','1','1','1',4,3,'1','1','1','1',true,'1','02',false,false,'pendente',CURRENT_DATE-1),
('d0000000-0000-4000-8000-000000000002','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','ef3f57cc-7ead-4c7c-88c7-1bfd841f6593','6232205','515105','898104332181965','Rua Sete de Setembro','120',false,'Jardim das Flores','27580000','Rio Claro','RJ','1','1','1',5,4,'1','1','1','1',true,'1','03',false,false,'pendente',CURRENT_DATE-2),
('d0000000-0000-4000-8000-000000000003','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','ef3f57cc-7ead-4c7c-88c7-1bfd841f6593','6232205','515105','898104332181965','Rua das Flores','130',false,'Jardim Botanico','27580000','Rio Claro','RJ','1','1','1',3,5,'1','1','1','1',true,'1','04',false,false,'pendente',CURRENT_DATE-3),
('d0000000-0000-4000-8000-000000000004','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','ef3f57cc-7ead-4c7c-88c7-1bfd841f6593','6232205','515105','898104332181965','Avenida Rio Branco','140',false,'Vila Operaria','27580000','Rio Claro','RJ','1','1','1',4,2,'1','1','1','1',true,'1','05',false,false,'pendente',CURRENT_DATE-4),
('d0000000-0000-4000-8000-000000000005','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','ef3f57cc-7ead-4c7c-88c7-1bfd841f6593','6232205','515105','898104332181965','Rua Marechal Deodoro','150',false,'Jardim America','27580000','Rio Claro','RJ','1','1','1',5,3,'1','1','1','1',true,'1','01',false,false,'pendente',CURRENT_DATE-5),
('d0000000-0000-4000-8000-000000000006','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','ef3f57cc-7ead-4c7c-88c7-1bfd841f6593','6232205','515105','898104332181965','Rua dos Ipes','160',false,'Parque das Arvores','27580000','Rio Claro','RJ','1','1','1',3,4,'1','1','1','1',true,'1','02',false,false,'pendente',CURRENT_DATE-6),
('d0000000-0000-4000-8000-000000000007','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','ef3f57cc-7ead-4c7c-88c7-1bfd841f6593','6232205','515105','898104332181965','Rua Padre Anchieta','170',false,'Vila Sao Jose','27580000','Rio Claro','RJ','1','1','1',4,5,'1','1','1','1',true,'1','03',false,false,'pendente',CURRENT_DATE-7),
('d0000000-0000-4000-8000-000000000008','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','ef3f57cc-7ead-4c7c-88c7-1bfd841f6593','6232205','515105','898104332181965','Rua Tiradentes','180',false,'Jardim Primavera','27580000','Rio Claro','RJ','1','1','1',5,2,'1','1','1','1',true,'1','04',false,false,'pendente',CURRENT_DATE-8),
('d0000000-0000-4000-8000-000000000009','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','ef3f57cc-7ead-4c7c-88c7-1bfd841f6593','6232205','515105','898104332181965','Rua Quinze de Novembro','190',false,'Centro','27580000','Rio Claro','RJ','1','1','1',3,3,'1','1','1','1',true,'1','05',false,false,'pendente',CURRENT_DATE-9)
ON CONFLICT (id) DO UPDATE SET status_envio='pendente', exportacao_id=NULL, exportado_em=NULL;

INSERT INTO familias (id, domicilio_id, responsavel_paciente_id, data_cadastro) VALUES
('f0000000-0000-4000-8000-000000000000','d0000000-0000-4000-8000-000000000000','a0000000-0000-4000-8000-000000000000',CURRENT_DATE),
('f0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',CURRENT_DATE),
('f0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002',CURRENT_DATE),
('f0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000003',CURRENT_DATE),
('f0000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000004',CURRENT_DATE),
('f0000000-0000-4000-8000-000000000005','d0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000005',CURRENT_DATE),
('f0000000-0000-4000-8000-000000000006','d0000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000006',CURRENT_DATE),
('f0000000-0000-4000-8000-000000000007','d0000000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-000000000007',CURRENT_DATE),
('f0000000-0000-4000-8000-000000000008','d0000000-0000-4000-8000-000000000008','a0000000-0000-4000-8000-000000000008',CURRENT_DATE),
('f0000000-0000-4000-8000-000000000009','d0000000-0000-4000-8000-000000000009','a0000000-0000-4000-8000-000000000009',CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO familia_membros (familia_id, paciente_id, is_responsavel) VALUES
('f0000000-0000-4000-8000-000000000000','a0000000-0000-4000-8000-000000000000',true),
('f0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',true),
('f0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002',true),
('f0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000003',true),
('f0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000004',true),
('f0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000005',true),
('f0000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000006',true),
('f0000000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-000000000007',true),
('f0000000-0000-4000-8000-000000000008','a0000000-0000-4000-8000-000000000008',true),
('f0000000-0000-4000-8000-000000000009','a0000000-0000-4000-8000-000000000009',true)
ON CONFLICT DO NOTHING;

INSERT INTO atendimentos (id, paciente_id, profissional_id, unidade_id, criado_por,
  data_atendimento, hora_inicio, turno, modalidade, tipo_atendimento, local_atendimento,
  soap_s, soap_o, soap_a, soap_p, cids, ciaps,
  pa, fc, fr, temperatura, peso, altura, imc,
  finalizado_em, status_envio, duracao_segundos)
VALUES
('e0000000-0000-4000-8000-000000000000','a0000000-0000-4000-8000-000000000000','3fe0f1ff-2630-4019-bf84-2ee267bc6b3d','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','3d678642-7cb5-48e9-92fc-d05df720e761',CURRENT_DATE,'08:00','manha','presencial','1','ubs','Refere dor de cabeca','Bom estado geral','Hipertensao essencial','Iniciar losartana','{I10}','{A04}','120/80','72','16','36.5',70,1.65,25.7,now(),'pendente',600),
('e0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','3fe0f1ff-2630-4019-bf84-2ee267bc6b3d','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','3d678642-7cb5-48e9-92fc-d05df720e761',CURRENT_DATE-1,'09:00','manha','presencial','1','ubs','Sede e poliuria','Glicemia 180','Diabetes tipo 2','Metformina 500mg','{E11}','{T90}','130/85','75','17','36.6',78,1.70,27.0,now()-interval '1 day','pendente',720),
('e0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','3fe0f1ff-2630-4019-bf84-2ee267bc6b3d','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','3d678642-7cb5-48e9-92fc-d05df720e761',CURRENT_DATE-2,'14:00','tarde','presencial','1','ubs','Coriza e tosse','Mucosa hiperemiada','Resfriado comum','Sintomaticos','{J00}','{R05}','115/75','80','18','37.0',60,1.60,23.4,now()-interval '2 days','pendente',540),
('e0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000003','3fe0f1ff-2630-4019-bf84-2ee267bc6b3d','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','3d678642-7cb5-48e9-92fc-d05df720e761',CURRENT_DATE-3,'10:00','manha','presencial','1','ubs','Pirose pos prandial','Abdome flacido','Gastrite','Omeprazol','{K30}','{D02}','125/80','78','17','36.7',85,1.75,27.8,now()-interval '3 days','pendente',660),
('e0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000004','3fe0f1ff-2630-4019-bf84-2ee267bc6b3d','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','3d678642-7cb5-48e9-92fc-d05df720e761',CURRENT_DATE-4,'15:00','tarde','presencial','1','ubs','Lombalgia ha 3 dias','Dor a palpacao L4-L5','Lombalgia mecanica','Repouso e dipirona','{M54}','{L02}','118/78','72','16','36.4',65,1.62,24.8,now()-interval '4 days','pendente',480),
('e0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000005','3fe0f1ff-2630-4019-bf84-2ee267bc6b3d','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','3d678642-7cb5-48e9-92fc-d05df720e761',CURRENT_DATE-5,'08:30','manha','presencial','1','ubs','Disuria','EAS alterado','ITU','Nitrofurantoina','{N39}','{U71}','122/80','74','17','36.8',82,1.72,27.7,now()-interval '5 days','pendente',600),
('e0000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000006','3fe0f1ff-2630-4019-bf84-2ee267bc6b3d','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','3d678642-7cb5-48e9-92fc-d05df720e761',CURRENT_DATE-6,'16:00','tarde','presencial','1','ubs','Cefaleia tensional','PA normal','Cefaleia','Paracetamol','{R51}','{N01}','116/76','70','15','36.5',58,1.58,23.2,now()-interval '6 days','pendente',420),
('e0000000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-000000000007','3fe0f1ff-2630-4019-bf84-2ee267bc6b3d','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','3d678642-7cb5-48e9-92fc-d05df720e761',CURRENT_DATE-7,'09:30','manha','presencial','1','ubs','Febre e mialgia','Estado geral preservado','Sindrome viral','Hidratacao','{B34}','{A77}','120/80','82','18','38.0',75,1.78,23.7,now()-interval '7 days','pendente',540),
('e0000000-0000-4000-8000-000000000008','a0000000-0000-4000-8000-000000000008','3fe0f1ff-2630-4019-bf84-2ee267bc6b3d','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','3d678642-7cb5-48e9-92fc-d05df720e761',CURRENT_DATE-8,'14:30','tarde','presencial','1','ubs','Ganho de peso','IMC elevado','Obesidade','Orientacoes','{E66}','{T82}','130/85','78','17','36.6',95,1.65,34.9,now()-interval '8 days','pendente',900),
('e0000000-0000-4000-8000-000000000009','a0000000-0000-4000-8000-000000000009','3fe0f1ff-2630-4019-bf84-2ee267bc6b3d','fb4a0da0-9cc8-40e1-bef0-bf80b3146807','3d678642-7cb5-48e9-92fc-d05df720e761',CURRENT_DATE-9,'10:30','manha','presencial','1','ubs','Olho vermelho','Hiperemia conjuntival','Conjuntivite','Colirio','{H10}','{F02}','118/78','76','16','36.7',80,1.72,27.0,now()-interval '9 days','pendente',480)
ON CONFLICT (id) DO UPDATE SET status_envio='pendente', exportacao_id=NULL, exportado_em=NULL, finalizado_em=EXCLUDED.finalizado_em;