import re
from .content_blocks import iter_content_blocks

def validate_and_repair(content: dict, pattern=None):
    errors=[]
    bp = pattern.blueprint if pattern else {}
    rules=bp.get('generation_rules',{})
    if rules.get('operation') == 'addition' and rules.get('max_result'):
        max_result=int(rules['max_result']); repaired=[]; idx=1
        for block in iter_content_blocks(content):
            if block.get('type')=='task_grid':
                for item in block.get('items',[]):
                    text=item.get('text','')
                    nums=[int(n) for n in re.findall(r'\d+', text)]
                    if len(nums)>=2 and '+' in text:
                        ans=sum(nums[:2])
                        if ans <= max_result:
                            item['answer']=ans; repaired.append({'label':item.get('label',str(idx)),'answer':ans}); idx+=1
                        else:
                            errors.append(f'Invalid addition result > {max_result}: {text}')
                    else: errors.append(f'Invalid addition task: {text}')
        content['solutions']=repaired or content.get('solutions',[])
    return content, errors
