from django.core.management.base import BaseCommand
from django.utils.text import slugify
from apps.curriculum.models import FederalState, SchoolType, Subject, GradeLevel, CurriculumUnit
class Command(BaseCommand):
    def handle(self,*args,**kwargs):
        states=['Bayern','Nordrhein-Westfalen','Berlin']
        schools=['Grundschule','Gymnasium','Gesamtschule']
        subjects=['Mathematik','Deutsch','Sachkunde','Englisch','Biologie','Physik','Chemie','Geschichte','Politik','Informatik']
        for n in states: FederalState.objects.get_or_create(slug=slugify(n), defaults={'name':n})
        for n in schools: SchoolType.objects.get_or_create(slug=slugify(n), defaults={'name':n})
        for n in subjects: Subject.objects.get_or_create(slug=slugify(n), defaults={'name':n})
        for i in range(1,14): GradeLevel.objects.get_or_create(value=i, defaults={'label': f'Klasse {i}' if i <= 13 else str(i)})
        b=FederalState.objects.first(); gs=SchoolType.objects.get(slug='grundschule')
        demos=[('Mathematik',1,'Addition bis 20','Additionsaufgaben im Zahlenraum bis 20 sicher lösen.'),('Mathematik',2,'Addition und Subtraktion bis 100','Rechenstrategien anwenden und Ergebnisse prüfen.'),('Deutsch',2,'Lesen und verstehen','Kurze Texte lesen und Fragen beantworten.'),('Sachkunde',3,'Verkehrssicheres Fahrrad','Bestandteile eines sicheren Fahrrads benennen.'),('Biologie',7,'Zelle','Bestandteile der Zelle beschreiben.')]
        for subj,grade,topic,comp in demos:
            s=Subject.objects.get(name=subj); g=GradeLevel.objects.get(value=grade)
            CurriculumUnit.objects.get_or_create(federal_state=b, school_type=gs, subject=s, grade_level=g, topic=topic, defaults={'title':topic,'competency_text':comp,'keywords':[topic.lower()]})
        self.stdout.write(self.style.SUCCESS('Seed data loaded.'))
